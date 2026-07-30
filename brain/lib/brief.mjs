/**
 * Boot brief — the brain's answer to "what do I need to know right now?"
 *
 * This is the file a fresh agent session reads to recover context without
 * re-deriving it from a long chat history, which is the single largest cost
 * driver in this project. It is generated, never hand-edited: if the notes are
 * right, the brief is right.
 *
 * It deliberately surfaces what is *uncertain* alongside what is known. A brief
 * that only lists conclusions teaches the next session to trust things it
 * should question.
 */
import { isStale, daysSince } from "./note.mjs";
import { health } from "./store.mjs";

const byRecency = (a, b) =>
  Date.parse(b.meta.verified || b.meta.created || 0) - Date.parse(a.meta.verified || a.meta.created || 0);

export function buildBrief(notes, { now = new Date() } = {}) {
  const h = health(notes);
  const of = (t) => notes.filter((n) => n.meta.type === t);
  const open = (n) => n.meta.status !== "done" && n.meta.status !== "archived";

  const L = [];
  L.push("# BOOT BRIEF", "");
  L.push(`> Generated ${now.toISOString().slice(0, 10)} from ${notes.length} notes.`,
         "> Do not edit by hand — edit the notes and regenerate (`npm run brain:brief`).",
         "> Read this first; it replaces re-reading the whole chat history.", "");

  /* --- identity ------------------------------------------------------- */
  const entities = of("entity").sort(byRecency);
  if (entities.length) {
    L.push("## Who and what", "");
    for (const n of entities) {
      L.push(`- **${n.meta.title}** — ${firstLine(n.body)}` + staleMark(n));
    }
    L.push("");
  }

  /* --- standing decisions --------------------------------------------- */
  const decisions = of("decision").filter(open).sort(byRecency);
  if (decisions.length) {
    L.push("## Standing decisions", "",
      "Already settled. Do not relitigate without new information.", "");
    for (const n of decisions) {
      L.push(`- **${n.meta.title}** — ${firstLine(n.body)}` + staleMark(n));
    }
    L.push("");
  }

  /* --- constraints ----------------------------------------------------- */
  const constraints = notes.filter((n) => (n.meta.tags || []).includes("constraint")).sort(byRecency);
  if (constraints.length) {
    L.push("## Hard constraints", "", "Violating these is a failure, not a trade-off.", "");
    for (const n of constraints) L.push(`- **${n.meta.title}** — ${firstLine(n.body)}`);
    L.push("");
  }

  /* --- facts, split by trustworthiness --------------------------------- */
  const facts = of("fact").filter(open);
  const solid = facts.filter((n) => n.meta.source !== "inferred" && n.meta.confidence !== "low");
  const shaky = facts.filter((n) => n.meta.source === "inferred" || n.meta.confidence === "low");
  if (solid.length) {
    L.push("## Established facts", "");
    for (const n of solid.sort(byRecency)) {
      L.push(`- ${n.meta.title} — ${firstLine(n.body)} \`${n.meta.source}\`` + staleMark(n));
    }
    L.push("");
  }
  if (shaky.length) {
    L.push("## Unverified — treat as assumptions", "",
      "These are inferred or low-confidence. Confirm before acting on them.", "");
    for (const n of shaky.sort(byRecency)) {
      L.push(`- ${n.meta.title} — ${firstLine(n.body)} \`${n.meta.source || "?"}/${n.meta.confidence || "?"}\``);
    }
    L.push("");
  }

  /* --- open work ------------------------------------------------------- */
  const tasks = of("task").filter(open);
  const blocked = tasks.filter((n) => n.meta.status === "blocked");
  const active = tasks.filter((n) => n.meta.status !== "blocked");
  if (active.length) {
    L.push("## Open work", "");
    for (const n of active.sort(byRecency)) L.push(`- [ ] **${n.meta.title}** — ${firstLine(n.body)}`);
    L.push("");
  }
  if (blocked.length) {
    L.push("## Blocked — needs Juan", "");
    for (const n of blocked.sort(byRecency)) L.push(`- **${n.meta.title}** — ${firstLine(n.body)}`);
    L.push("");
  }

  /* --- lessons --------------------------------------------------------- */
  const insights = of("insight").sort(byRecency).slice(0, 12);
  if (insights.length) {
    L.push("## Lessons learned", "", "Earned the hard way. Do not repeat the mistake.", "");
    for (const n of insights) L.push(`- ${firstLine(n.body)} *(${n.meta.title})*`);
    L.push("");
  }

  /* --- playbooks ------------------------------------------------------- */
  const plays = of("playbook").sort(byRecency);
  if (plays.length) {
    L.push("## Playbooks", "");
    for (const n of plays) L.push(`- **${n.meta.title}** — ${firstLine(n.body)}`);
    L.push("");
  }

  /* --- integrity ------------------------------------------------------- */
  const issues = [];
  if (h.contradictions.length) issues.push(`${h.contradictions.length} contradiction(s)`);
  if (h.stale.length) issues.push(`${h.stale.length} stale note(s)`);
  if (h.linted.length) issues.push(`${h.linted.length} note(s) failing lint`);
  if (h.broken.length) issues.push(`${h.broken.length} broken link(s)`);
  L.push("## Brain health", "");
  L.push(issues.length ? `⚠ ${issues.join(" · ")} — run \`npm run brain:review\`` : "✓ clean");
  if (h.contradictions.length) {
    L.push("", "**Contradictions — resolve before trusting either side:**");
    for (const c of h.contradictions) L.push(`- \`${c.claim}\`: ${c.notes.join(" vs ")}`);
  }
  L.push("");

  return L.join("\n");
}

function firstLine(body) {
  const line = (body || "").split("\n").map((s) => s.trim()).find((s) => s && !s.startsWith("#")) || "";
  return line.replace(/\[\[([^\]]+)\]\]/g, "$1").slice(0, 220);
}

function staleMark(n) {
  if (!isStale(n)) return "";
  return `  _(unverified ${daysSince(n.meta.verified || n.meta.created)}d)_`;
}
