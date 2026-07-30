/**
 * Trend research — score, rank, and scaffold.
 *
 *   node dropship/research.mjs score <candidates.json>
 *   node dropship/research.mjs scaffold <candidates.json> <id>
 *
 * The agent gathers raw signal (web search, browser automation) and writes it
 * into a candidates file. This tool is the deterministic half: it applies the
 * market gates consistently, ranks what survives, and scaffolds a product brief
 * for a winner so no field is silently skipped.
 *
 * Scoring is transparent — every candidate reports which gate it failed and
 * why, so a rejection can be argued with.
 */
import fs from "fs";
import path from "path";
import { GATES } from "./lib/schema.mjs";

/* ---------------------------------------------------------------- scoring */

/**
 * Weighted model. Hard gates can veto outright: a candidate that cannot be
 * demonstrated in three seconds or cannot carry 3x margin is not a candidate,
 * regardless of how well it scores elsewhere.
 */
export const WEIGHTS = {
  margin: 30,     // survives paid acquisition
  demoable: 25,   // works on short-form at all
  momentum: 20,   // rising, not peaked
  priceBand: 15,  // impulse purchase
  problem: 10,    // recurring need beats novelty
};

export const HARD_GATES = ["margin", "demoable"];

export function scoreCandidate(c) {
  const reasons = [];
  const g = {};

  const landed = (c.supplierCost ?? 0) + (c.shippingCost ?? 0);
  const marginMultiple = landed > 0 && c.sellPrice ? c.sellPrice / landed : null;
  g.margin = marginMultiple != null ? marginMultiple >= GATES.MARGIN_MIN : null;
  if (g.margin === false) reasons.push(`margin ${marginMultiple.toFixed(2)}x < ${GATES.MARGIN_MIN}x`);
  if (g.margin === null) reasons.push("margin unknown (missing cost or price)");

  g.demoable = typeof c.demoIn3s === "string" && c.demoIn3s.trim().length > 0;
  if (!g.demoable) reasons.push("no 3-second demo");

  g.momentum = typeof c.momentum === "number" ? c.momentum >= GATES.MOMENTUM_MIN : null;
  if (g.momentum === false) reasons.push(`momentum ${c.momentum} < ${GATES.MOMENTUM_MIN}`);
  if (g.momentum === null) reasons.push("momentum unscored");

  g.priceBand = typeof c.sellPrice === "number"
    ? c.sellPrice >= GATES.PRICE_MIN && c.sellPrice <= GATES.PRICE_MAX : null;
  if (g.priceBand === false) reasons.push(`price $${c.sellPrice} outside $${GATES.PRICE_MIN}-${GATES.PRICE_MAX}`);

  g.problem = typeof c.problem === "string" && c.problem.trim().length > 0;
  if (!g.problem) reasons.push("no stated problem (novelty risk)");

  let score = 0, possible = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    if (g[k] === null) continue;      // unknown neither rewards nor penalises
    possible += w;
    if (g[k]) score += w;
  }
  const pct = possible > 0 ? Math.round((score / possible) * 100) : 0;

  const vetoed = HARD_GATES.filter((k) => g[k] === false);
  const unsourced = !c.sources || c.sources.length === 0;
  if (unsourced) reasons.push("unsourced trend claim");

  return {
    id: c.id || c.name,
    name: c.name,
    score: pct,
    marginMultiple: marginMultiple != null ? Number(marginMultiple.toFixed(2)) : null,
    gates: g,
    vetoed,
    verdict: vetoed.length ? "REJECT" : pct >= 70 ? "GO" : pct >= 50 ? "WATCH" : "PASS",
    reasons,
  };
}

export function rank(candidates) {
  return candidates
    .map(scoreCandidate)
    .sort((a, b) => {
      const order = { GO: 0, WATCH: 1, PASS: 2, REJECT: 3 };
      if (order[a.verdict] !== order[b.verdict]) return order[a.verdict] - order[b.verdict];
      return b.score - a.score;
    });
}

/* -------------------------------------------------------------- scaffold */

export function scaffold(c) {
  const slug = (c.id || c.name || "product").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    _status: `SCAFFOLDED from research ${new Date().toISOString().slice(0, 10)}. ` +
      `Fields left null are UNVERIFIED — fill from the real supplier listing before running traffic.`,
    slug,
    name: c.name || "",
    tagline: c.tagline || "",
    category: c.category || "",
    economics: {
      supplierCost: c.supplierCost ?? null,
      shippingCost: c.shippingCost ?? null,
      sellPrice: c.sellPrice ?? null,
      compareAtPrice: c.compareAtPrice ?? null,
      currency: "USD",
    },
    source: {
      platform: "AliExpress",
      listingUrl: c.listingUrl ?? null,
      supplierRating: null,
      unitsSold: null,
      shipDays: null,
    },
    trend: {
      signal: c.signal || null,
      sources: c.sources || [],
      momentum: c.momentum ?? null,
      checkedOn: new Date().toISOString().slice(0, 10),
    },
    positioning: {
      problem: c.problem || "",
      agitation: "",
      solution: "",
      demoIn3s: c.demoIn3s || "",
      buyer: "",
      objections: [],
    },
    benefits: [],
    howItWorks: [],
    specs: [],
    faq: [],
    reviews: { rating: null, count: null, quotes: [] },
    guarantee: { returnDays: 30, text: "30-day returns. If it does not do what this page says, send it back." },
    shipping: { freeOver: null, estimate: "" },
    cta: { primary: "Add to cart", url: "#" },
    brand: { storeName: "", accent: "#c2532b", register: "clean", supportEmail: null },
    media: { heroImage: null, gallery: [] },
    legal: { disclaimers: [] },
  };
}

/* ------------------------------------------------------------------- cli */
function table(rows) {
  const V = { GO: "GO   ", WATCH: "WATCH", PASS: "PASS ", REJECT: "REJECT" };
  const lines = [];
  for (const r of rows) {
    lines.push(
      `${V[r.verdict]} ${String(r.score).padStart(3)}%  ${r.name}` +
      (r.marginMultiple ? `  (${r.marginMultiple}x)` : "")
    );
    if (r.reasons.length) lines.push(`        ${r.reasons.join("; ")}`);
  }
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, file, id] = process.argv.slice(2);
  if (!cmd || !file) {
    console.error("usage:\n  node dropship/research.mjs score <candidates.json>" +
                  "\n  node dropship/research.mjs scaffold <candidates.json> <id>");
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const candidates = Array.isArray(data) ? data : data.candidates || [];

  if (cmd === "score") {
    const rows = rank(candidates);
    console.log(table(rows));
    const go = rows.filter((r) => r.verdict === "GO");
    console.log(`\n${rows.length} scored · ${go.length} GO · ` +
      `${rows.filter((r) => r.verdict === "WATCH").length} WATCH · ` +
      `${rows.filter((r) => r.verdict === "REJECT").length} REJECT`);
    if (go.length) console.log(`\nnext: node dropship/research.mjs scaffold ${file} ${go[0].id}`);
    process.exit(0);
  }

  if (cmd === "scaffold") {
    const c = candidates.find((x) => (x.id || x.name) === id);
    if (!c) { console.error(`no candidate with id "${id}"`); process.exit(1); }
    const brief = scaffold(c);
    const out = path.join(path.dirname(file), `${brief.slug}.json`);
    if (fs.existsSync(out)) { console.error(`refusing to overwrite ${out}`); process.exit(1); }
    fs.writeFileSync(out, JSON.stringify(brief, null, 2) + "\n");
    console.log(`✓ ${out}\n  fill positioning, benefits, howItWorks, specs, faq — then:`);
    console.log(`  node dropship/build-page.mjs ${out}`);
    process.exit(0);
  }

  console.error(`unknown command "${cmd}"`);
  process.exit(2);
}
