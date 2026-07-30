/**
 * Note format and parsing.
 *
 * A note is markdown with a frontmatter block. Plain files, so the brain stays
 * readable, diffable, and greppable without this code — the tooling is an
 * accelerator, never a lock-in.
 *
 * Provenance is mandatory, not decorative. Every claim carries where it came
 * from and how much to trust it, so a future session can tell the difference
 * between something Juan said, something measured, and something inferred.
 */

export const TYPES = ["entity", "fact", "decision", "insight", "task", "playbook"];
export const CONFIDENCE = ["high", "medium", "low"];
/** Where a claim came from. `inferred` is the one that must never masquerade as fact. */
export const SOURCES = ["juan", "measured", "external", "inferred"];

/** Default review interval per type, in days. Facts rot faster than decisions. */
export const TTL_DAYS = {
  fact: 90,
  entity: 180,
  decision: 365,
  insight: 180,
  task: 30,
  playbook: 180,
};

const LIST_KEYS = new Set(["tags", "links", "sources"]);

/** Minimal frontmatter parser — deliberately not YAML, to avoid a dependency. */
export function parse(raw, id = "") {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) return { id, meta: {}, body: raw.trim(), raw };

  const meta = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (LIST_KEYS.has(key)) {
      val = val.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else if (/^\d+$/.test(val)) val = Number(val);
    else if (val === "true" || val === "false") val = val === "true";
    else val = val.replace(/^["']|["']$/g, "");
    meta[key] = val;
  }
  return { id, meta, body: m[2].trim(), raw };
}

export function serialize(meta, body) {
  const order = ["title", "type", "status", "confidence", "source", "sources",
                 "created", "verified", "ttl", "tags", "links", "claim", "value"];
  const keys = [...order.filter((k) => meta[k] !== undefined),
                ...Object.keys(meta).filter((k) => !order.includes(k))];
  const lines = keys.map((k) => {
    const v = meta[k];
    return `${k}: ${Array.isArray(v) ? "[" + v.join(", ") + "]" : v}`;
  });
  return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function daysSince(iso) {
  if (!iso) return Infinity;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86400000);
}

/** A note is stale when it has gone unverified past its type's review interval. */
export function isStale(note, now = Date.now()) {
  const ttl = note.meta.ttl || TTL_DAYS[note.meta.type] || 180;
  const ref = note.meta.verified || note.meta.created;
  if (!ref) return true;
  const t = Date.parse(ref);
  if (Number.isNaN(t)) return true;
  return Math.floor((now - t) / 86400000) > ttl;
}

/** Structural problems that make a note untrustworthy. */
export function lint(note) {
  const problems = [];
  const m = note.meta;
  if (!m.title) problems.push("missing title");
  if (!m.type) problems.push("missing type");
  else if (!TYPES.includes(m.type)) problems.push(`unknown type "${m.type}"`);
  if (!m.created) problems.push("missing created date");
  if (m.confidence && !CONFIDENCE.includes(m.confidence)) problems.push(`unknown confidence "${m.confidence}"`);
  if (m.source && !SOURCES.includes(m.source)) problems.push(`unknown source "${m.source}"`);
  if (m.type === "fact" && !m.source) problems.push("a fact must declare a source");
  if (m.source === "external" && !(m.sources || []).length) {
    problems.push("external source declared but no URL given");
  }
  if (m.source === "inferred" && m.confidence === "high") {
    problems.push("inferred claims cannot be high confidence");
  }
  if (!note.body || note.body.length < 10) problems.push("body is empty or near-empty");
  return problems;
}
