/**
 * The store: load every note, build the link graph, and expose lookups.
 *
 * Everything is derived at read time. There is no cache file to fall out of
 * sync with the notes, which is the usual way a knowledge base starts lying.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse, serialize, today, isStale, lint } from "./note.mjs";

export const BRAIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const NOTES = path.join(BRAIN, "notes");

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function load(dir = NOTES) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const id = f.replace(/\.md$/, "");
      const n = parse(fs.readFileSync(path.join(dir, f), "utf8"), id);
      n.file = path.join(dir, f);
      return n;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Link graph. Links are declared in frontmatter (`links: [a, b]`) and inline
 * as [[wikilinks]]; both are collected, and backlinks are derived so a note
 * never has to know who points at it.
 */
export function graph(notes) {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const out = new Map(), back = new Map(), broken = [];
  for (const n of notes) { out.set(n.id, new Set()); back.set(n.id, new Set()); }

  for (const n of notes) {
    const declared = n.meta.links || [];
    const inline = [...n.body.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => slugify(m[1]));
    for (const target of new Set([...declared.map(slugify), ...inline])) {
      if (!byId.has(target)) { broken.push({ from: n.id, to: target }); continue; }
      out.get(n.id).add(target);
      back.get(target).add(n.id);
    }
  }
  return { byId, out, back, broken };
}

export function write(meta, body, dir = NOTES) {
  fs.mkdirSync(dir, { recursive: true });
  const id = slugify(meta.id || meta.title);
  const file = path.join(dir, `${id}.md`);
  const full = { ...meta };
  delete full.id;
  full.created = full.created || today();
  fs.writeFileSync(file, serialize(full, body));
  return { id, file };
}

export function touch(note, when = today()) {
  note.meta.verified = when;
  fs.writeFileSync(note.file, serialize(note.meta, note.body));
  return note;
}

/** Aggregate health, used by `review` and by CI. */
export function health(notes) {
  const g = graph(notes);
  const stale = notes.filter(isStale);
  const linted = notes.map((n) => ({ id: n.id, problems: lint(n) })).filter((x) => x.problems.length);
  const orphans = notes.filter((n) =>
    g.out.get(n.id).size === 0 && g.back.get(n.id).size === 0);
  const unverified = notes.filter((n) => n.meta.source === "inferred");
  const lowConf = notes.filter((n) => n.meta.confidence === "low");

  // Contradiction: two notes asserting different values for the same claim key.
  const claims = new Map();
  for (const n of notes) {
    if (!n.meta.claim) continue;
    const k = String(n.meta.claim);
    if (!claims.has(k)) claims.set(k, []);
    claims.get(k).push(n);
  }
  const contradictions = [];
  for (const [k, group] of claims) {
    const values = new Set(group.map((n) => String(n.meta.value ?? "")));
    if (values.size > 1) {
      contradictions.push({ claim: k, notes: group.map((n) => `${n.id}=${n.meta.value}`) });
    }
  }

  return { total: notes.length, stale, linted, orphans, unverified, lowConf, contradictions, broken: g.broken, graph: g };
}
