#!/usr/bin/env node
/**
 * Scorpion second brain — CLI.
 *
 *   brain capture   add a note (identity, fact, decision, insight, task, playbook)
 *   brain recall    ranked search
 *   brain show      read a note with its neighbourhood
 *   brain link      relate two notes
 *   brain verify    mark a note re-checked today
 *   brain review    integrity report — stale, contradictions, lint, orphans
 *   brain brief     regenerate BOOT.md, the context a fresh session loads
 *   brain stats     inventory
 *
 * Zero dependencies. Notes are plain markdown; this tool is an accelerator,
 * not a gatekeeper.
 */
import fs from "fs";
import path from "path";
import { load, write, touch, health, graph, slugify, BRAIN, NOTES } from "./lib/store.mjs";
import { search, neighbourhood } from "./lib/query.mjs";
import { buildBrief } from "./lib/brief.mjs";
import { TYPES, CONFIDENCE, SOURCES, today, isStale, lint, daysSince } from "./lib/note.mjs";

const args = process.argv.slice(2);
const cmd = args[0];

/** --flag value / --flag=value */
function flag(name, dflt) {
  const i = args.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return dflt;
  const a = args[i];
  if (a.includes("=")) return a.slice(a.indexOf("=") + 1);
  const next = args[i + 1];
  return next && !next.startsWith("--") ? next : true;
}
const positional = () => args.slice(1).filter((a) => !a.startsWith("--") &&
  !(args[args.indexOf(a) - 1] || "").startsWith("--"));

const C = { dim: "\x1b[2m", b: "\x1b[1m", r: "\x1b[0m", y: "\x1b[33m", g: "\x1b[32m", rd: "\x1b[31m" };
const plain = !process.stdout.isTTY || process.env.NO_COLOR;
const c = (k, s) => (plain ? s : C[k] + s + C.r);

function usage(code = 0) {
  console.log(`scorpion brain

  capture --title T --type ${TYPES.join("|")} [--source ${SOURCES.join("|")}]
          [--confidence ${CONFIDENCE.join("|")}] [--tags a,b] [--links x,y]
          [--claim key --value v] [--status s] [--body "text"]
  recall <query> [--type T] [--tag T] [--limit N] [--fresh]
  show <id> [--depth N]
  link <from> <to>
  verify <id>
  review [--json] [--strict]
  brief [--write]
  stats`);
  process.exit(code);
}

/* ------------------------------------------------------------------ capture */
function capture() {
  const title = flag("title");
  const type = flag("type");
  if (!title || !type) { console.error("capture needs --title and --type"); usage(2); }
  if (!TYPES.includes(type)) { console.error(`--type must be one of ${TYPES.join(", ")}`); process.exit(2); }

  let body = flag("body");
  if (!body || body === true) {
    // Accept piped stdin so notes can be captured from other tools.
    body = fs.existsSync(0) ? fs.readFileSync(0, "utf8").trim() : "";
  }
  if (!body) { console.error("capture needs --body or piped stdin"); process.exit(2); }

  const meta = {
    title, type,
    status: flag("status", "open"),
    confidence: flag("confidence", "medium"),
    source: flag("source", "juan"),
    created: today(),
    verified: today(),
  };
  const tags = flag("tags"), links = flag("links"), sources = flag("sources");
  if (tags && tags !== true) meta.tags = String(tags).split(",").map((s) => s.trim());
  if (links && links !== true) meta.links = String(links).split(",").map((s) => slugify(s.trim()));
  if (sources && sources !== true) meta.sources = String(sources).split(",").map((s) => s.trim());
  const claim = flag("claim"), value = flag("value");
  if (claim && claim !== true) { meta.claim = claim; meta.value = value === undefined ? "" : value; }

  const problems = lint({ meta, body });
  if (problems.length) {
    console.error(c("rd", "✗ refusing to store an unsound note:"));
    problems.forEach((p) => console.error("  - " + p));
    process.exit(1);
  }
  const { id, file } = write(meta, body);
  console.log(c("g", "✓ ") + id + c("dim", `  ${path.relative(process.cwd(), file)}`));
}

/* ------------------------------------------------------------------- recall */
function recall() {
  const q = positional().join(" ");
  if (!q) { console.error("recall needs a query"); process.exit(2); }
  const notes = load();
  const res = search(q, notes, {
    limit: Number(flag("limit", 8)),
    type: flag("type") === true ? undefined : flag("type"),
    tag: flag("tag") === true ? undefined : flag("tag"),
    includeStale: !flag("fresh", false),
  });
  if (!res.length) { console.log(c("dim", "no matches")); return; }
  for (const { note, score, why } of res) {
    console.log(`${c("b", note.meta.title || note.id)} ${c("dim", `[${note.meta.type}] ${score}`)}`);
    console.log(`  ${firstLine(note.body)}`);
    console.log(c("dim", `  ${note.id} · ${why.join(" · ")}`));
    console.log();
  }
}

/* --------------------------------------------------------------------- show */
function show() {
  const id = slugify(positional()[0] || "");
  const notes = load();
  const g = graph(notes);
  const n = g.byId.get(id);
  if (!n) { console.error(`no note "${id}"`); process.exit(1); }
  console.log(c("b", n.meta.title));
  console.log(c("dim", Object.entries(n.meta).filter(([k]) => k !== "title")
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("|") : v}`).join("  ")));
  console.log();
  console.log(n.body);
  const near = neighbourhood(id, notes, Number(flag("depth", 1)));
  if (near.length) {
    console.log();
    console.log(c("dim", "— related —"));
    for (const m of near) console.log(`  ${m.id}  ${c("dim", m.meta.title || "")}`);
  }
}

/* --------------------------------------------------------------------- link */
function link() {
  const [from, to] = positional().map(slugify);
  if (!from || !to) { console.error("link needs <from> <to>"); process.exit(2); }
  const notes = load();
  const g = graph(notes);
  const a = g.byId.get(from), b = g.byId.get(to);
  if (!a) { console.error(`no note "${from}"`); process.exit(1); }
  if (!b) { console.error(`no note "${to}"`); process.exit(1); }
  const links = new Set(a.meta.links || []);
  if (links.has(to)) { console.log(c("dim", "already linked")); return; }
  links.add(to);
  a.meta.links = [...links];
  touch(a);
  console.log(c("g", "✓ ") + `${from} → ${to}`);
}

/* ------------------------------------------------------------------- verify */
function verify() {
  const id = slugify(positional()[0] || "");
  const notes = load();
  const n = notes.find((x) => x.id === id);
  if (!n) { console.error(`no note "${id}"`); process.exit(1); }
  touch(n);
  console.log(c("g", "✓ ") + `${id} verified ${today()}`);
}

/* ------------------------------------------------------------------- review */
function review() {
  const notes = load();
  const h = health(notes);
  if (flag("json")) {
    console.log(JSON.stringify({
      total: h.total,
      stale: h.stale.map((n) => n.id),
      lint: h.linted,
      orphans: h.orphans.map((n) => n.id),
      contradictions: h.contradictions,
      broken: h.broken,
      inferred: h.unverified.map((n) => n.id),
    }, null, 2));
    return h;
  }

  console.log(c("b", `brain review — ${h.total} notes`));
  const section = (label, items, fmt, sev = "y") => {
    if (!items.length) return;
    console.log(`\n${c(sev, label)} (${items.length})`);
    items.forEach((i) => console.log("  " + fmt(i)));
  };

  section("contradictions", h.contradictions,
    (x) => `${x.claim}: ${x.notes.join("  vs  ")}`, "rd");
  section("lint failures", h.linted,
    (x) => `${x.id}: ${x.problems.join("; ")}`, "rd");
  section("broken links", h.broken, (x) => `${x.from} → ${x.to} (missing)`, "rd");
  section("stale — needs re-verification", h.stale,
    (n) => `${n.id} (${daysSince(n.meta.verified || n.meta.created)}d, ttl ${n.meta.ttl || "default"})`);
  section("inferred — never treat as fact", h.unverified, (n) => n.id);
  section("orphans — unlinked from everything", h.orphans, (n) => n.id);

  const hard = h.contradictions.length + h.linted.length + h.broken.length;
  console.log();
  console.log(hard ? c("rd", `✗ ${hard} integrity problem(s)`) : c("g", "✓ integrity clean"));
  if (h.stale.length) console.log(c("dim", `  ${h.stale.length} note(s) due for review`));
  return h;
}

/* -------------------------------------------------------------------- brief */
function brief() {
  const notes = load();
  const md = buildBrief(notes);
  if (flag("write")) {
    const out = path.join(BRAIN, "BOOT.md");
    fs.writeFileSync(out, md);
    console.log(c("g", "✓ ") + path.relative(process.cwd(), out) + c("dim", `  (${notes.length} notes)`));
  } else {
    process.stdout.write(md);
  }
}

/* -------------------------------------------------------------------- stats */
function stats() {
  const notes = load();
  const g = graph(notes);
  const byType = {};
  for (const n of notes) byType[n.meta.type || "?"] = (byType[n.meta.type || "?"] || 0) + 1;
  const edges = [...g.out.values()].reduce((a, s) => a + s.size, 0);
  console.log(c("b", `${notes.length} notes · ${edges} links`));
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${t}`);
  }
  const stale = notes.filter(isStale).length;
  console.log(c("dim", `\n  ${stale} stale · ${notes.filter((n) => n.meta.source === "inferred").length} inferred`));
}

function firstLine(b) {
  return (b || "").split("\n").map((s) => s.trim()).find((s) => s && !s.startsWith("#"))?.slice(0, 150) || "";
}

const COMMANDS = { capture, recall, show, link, verify, review, brief, stats };

if (!cmd || cmd === "help" || cmd === "--help") usage(0);
if (!COMMANDS[cmd]) { console.error(`unknown command "${cmd}"`); usage(2); }

const result = COMMANDS[cmd]();
// `review --strict` is the CI gate: integrity problems fail the build.
if (cmd === "review" && flag("strict") && result) {
  const hard = result.contradictions.length + result.linted.length + result.broken.length;
  process.exit(hard ? 1 : 0);
}
