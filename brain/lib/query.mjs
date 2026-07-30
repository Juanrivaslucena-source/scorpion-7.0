/**
 * Recall — ranked retrieval over the notes.
 *
 * BM25 over title + tags + body, then adjusted by signals that matter for a
 * knowledge base rather than a document dump: confident notes outrank guesses,
 * fresh notes outrank stale ones, and well-connected notes outrank islands.
 *
 * No embeddings, no vector store, no dependency, no API call. For a few
 * thousand notes this is fast, deterministic, and explainable — you can always
 * see why something ranked where it did.
 */
import { isStale, daysSince } from "./note.mjs";
import { graph } from "./store.mjs";

const STOP = new Set(("a an the and or but if then of to in on for with is are was were be been " +
  "it its this that these those as at by from we our you your i").split(" "));

export function tokenize(s) {
  return String(s).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g)?.filter((t) => !STOP.has(t) && t.length > 1) || [];
}

const CONF_BOOST = { high: 1.15, medium: 1.0, low: 0.8 };
const SOURCE_BOOST = { juan: 1.2, measured: 1.15, external: 1.0, inferred: 0.75 };

/**
 * @param {string} q
 * @param {Array} notes
 * @param {{limit?:number, type?:string, tag?:string, includeStale?:boolean}} opts
 */
export function search(q, notes, opts = {}) {
  const { limit = 10, type, tag, includeStale = true } = opts;
  let pool = notes;
  if (type) pool = pool.filter((n) => n.meta.type === type);
  if (tag) pool = pool.filter((n) => (n.meta.tags || []).includes(tag));
  if (!includeStale) pool = pool.filter((n) => !isStale(n));
  if (!pool.length) return [];

  const terms = tokenize(q);
  if (!terms.length) return pool.slice(0, limit).map((n) => ({ note: n, score: 0, why: ["no query terms"] }));

  // Field-weighted document tokens.
  const docs = pool.map((n) => {
    const title = tokenize(n.meta.title || n.id);
    const tags = tokenize((n.meta.tags || []).join(" "));
    const body = tokenize(n.body);
    return { n, tokens: [...title, ...title, ...title, ...tags, ...tags, ...body] };
  });

  const N = docs.length;
  const avgLen = docs.reduce((a, d) => a + d.tokens.length, 0) / N || 1;
  const df = new Map();
  for (const d of docs) {
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
  }

  const k1 = 1.5, b = 0.75;
  const g = graph(pool);

  const scored = docs.map(({ n, tokens }) => {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    const hits = [];
    for (const term of terms) {
      const f = tf.get(term);
      if (!f) continue;
      const n_q = df.get(term) || 0;
      const idf = Math.log(1 + (N - n_q + 0.5) / (n_q + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (tokens.length / avgLen))));
      hits.push(term);
    }
    if (score === 0) return null;

    const why = [`matched: ${hits.join(", ")}`];
    const conf = CONF_BOOST[n.meta.confidence] ?? 1;
    const src = SOURCE_BOOST[n.meta.source] ?? 1;
    if (conf !== 1) why.push(`confidence ${n.meta.confidence}`);
    if (src !== 1) why.push(`source ${n.meta.source}`);
    score *= conf * src;

    if (isStale(n)) { score *= 0.7; why.push("stale"); }

    const degree = (g.out.get(n.id)?.size || 0) + (g.back.get(n.id)?.size || 0);
    if (degree) { score *= 1 + Math.min(degree, 8) * 0.03; why.push(`${degree} link(s)`); }

    const age = daysSince(n.meta.verified || n.meta.created);
    if (age < 14) { score *= 1.05; why.push("recent"); }

    return { note: n, score: Number(score.toFixed(4)), why };
  }).filter(Boolean);

  return scored.sort((a, b2) => b2.score - a.score).slice(0, limit);
}

/** Notes reachable within `depth` hops — the context around a topic. */
export function neighbourhood(id, notes, depth = 1) {
  const g = graph(notes);
  if (!g.byId.has(id)) return [];
  const seen = new Set([id]);
  let frontier = [id];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const cur of frontier) {
      for (const t of [...(g.out.get(cur) || []), ...(g.back.get(cur) || [])]) {
        if (!seen.has(t)) { seen.add(t); next.push(t); }
      }
    }
    frontier = next;
  }
  seen.delete(id);
  return [...seen].map((i) => g.byId.get(i));
}
