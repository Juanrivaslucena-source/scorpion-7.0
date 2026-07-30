/**
 * Product brief validation.
 *
 * Two severities:
 *   error   — the brief is unusable; generation should refuse.
 *   warning — the brief will generate, but something is missing or risky.
 *
 * Also encodes the market-validation gates from PIPELINE.md so a brief that
 * fails them is flagged before anyone spends money on ads.
 */

export const GATES = {
  PRICE_MIN: 20,
  PRICE_MAX: 40,
  MARGIN_MIN: 3,
  MOMENTUM_MIN: 60,
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

/** Claims that require substantiation we cannot provide for a dropship item. */
const BANNED_CLAIM = /\b(cure|cures|heals?|treats?|prevents?|FDA[- ]approved|clinically proven|guaranteed results?|miracle)\b/i;

/** Manufactured-urgency patterns. Enforced so the generator can never emit them. */
const FAKE_URGENCY = /\b(only \d+ left|\d+ people (are )?viewing|selling out fast|hurry|limited time only|act now)\b/i;

export function validate(p) {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(m);
  const W = (m) => warnings.push(m);

  if (!p || typeof p !== "object") return { ok: false, errors: ["brief is not an object"], warnings: [], gates: {} };

  /* identity */
  if (!isStr(p.slug)) E("slug is required");
  else if (!/^[a-z0-9][a-z0-9-]*$/.test(p.slug)) E(`slug "${p.slug}" must be lowercase kebab-case`);
  if (!isStr(p.name)) E("name is required");
  if (!isStr(p.tagline)) W("tagline missing — the hero will read as a bare product name");

  /* economics */
  const e = p.economics || {};
  if (!isNum(e.sellPrice) || e.sellPrice <= 0) E("economics.sellPrice is required and must be > 0");
  if (isNum(e.compareAtPrice) && isNum(e.sellPrice) && e.compareAtPrice <= e.sellPrice) {
    E("economics.compareAtPrice must exceed sellPrice — a struck-through price that is not higher is deceptive");
  }
  if (!isNum(e.supplierCost)) W("economics.supplierCost missing — margin cannot be checked");

  /* market gates */
  const gates = {};
  if (isNum(e.sellPrice)) {
    gates.priceBand = e.sellPrice >= GATES.PRICE_MIN && e.sellPrice <= GATES.PRICE_MAX;
    if (!gates.priceBand) {
      W(`sellPrice ${e.sellPrice} is outside the $${GATES.PRICE_MIN}-${GATES.PRICE_MAX} impulse band`);
    }
  }
  if (isNum(e.sellPrice) && isNum(e.supplierCost)) {
    const landed = e.supplierCost + (isNum(e.shippingCost) ? e.shippingCost : 0);
    const mult = landed > 0 ? e.sellPrice / landed : Infinity;
    gates.margin = mult >= GATES.MARGIN_MIN;
    gates.marginMultiple = Number(mult.toFixed(2));
    if (!gates.margin) W(`margin ${mult.toFixed(2)}x is below the ${GATES.MARGIN_MIN}x floor — ads will eat this`);
  }
  const t = p.trend || {};
  if (isNum(t.momentum)) {
    gates.momentum = t.momentum >= GATES.MOMENTUM_MIN;
    if (!gates.momentum) W(`trend.momentum ${t.momentum} is below ${GATES.MOMENTUM_MIN}`);
  } else W("trend.momentum missing — candidate has not been scored");
  if (!t.sources || !t.sources.length) W("trend.sources empty — the trend claim is unsourced");
  if (isStr(p.positioning?.demoIn3s)) gates.demoable = true;
  else W("positioning.demoIn3s missing — if it cannot be shown in 3s it will not sell on short-form");

  /* positioning */
  const pos = p.positioning || {};
  if (!isStr(pos.problem)) W("positioning.problem missing — the page opens with no reason to care");
  if (!isStr(pos.solution)) W("positioning.solution missing");

  /* proof integrity */
  const rv = p.reviews || {};
  const quotes = Array.isArray(rv.quotes) ? rv.quotes : [];
  if (rv.rating != null && quotes.length === 0) {
    E("reviews.rating is set with no quotes — a rating without sourced reviews will not be rendered; remove it or add real quotes");
  }
  if (isNum(rv.rating) && (rv.rating < 0 || rv.rating > 5)) E("reviews.rating must be between 0 and 5");
  if (quotes.length && !isNum(rv.rating)) W("review quotes present but no rating");
  if (quotes.length === 0) W("no verified reviews — the review section will be omitted (correct until real ones exist)");

  /* claim safety */
  const claimText = [
    p.tagline, pos.problem, pos.agitation, pos.solution,
    ...(p.benefits || []).flatMap((b) => [b.title, b.body]),
    ...(p.faq || []).flatMap((f) => [f.q, f.a]),
  ].filter(isStr).join(" ");
  // Judge per sentence: "this does not cure X" is a lawful disclaimer, not a claim.
  const NEGATED = /\b(not intended to|does not|do not|is not|no claim|makes no)\b/i;
  const DISCLAIMER = /diagnose,?\s*treat,?\s*cure/i;
  for (const s of claimText.split(/(?<=[.!?])\s+|\n+/)) {
    const m = s.match(BANNED_CLAIM);
    if (!m || NEGATED.test(s) || DISCLAIMER.test(s)) continue;
    E(`copy contains an unsubstantiated claim (${m[0]}) — remove it; this is regulated language`);
    break;
  }
  if (FAKE_URGENCY.test(claimText)) {
    E(`copy contains manufactured urgency (${claimText.match(FAKE_URGENCY)[0]}) — not permitted`);
  }
  if ((p.category === "beauty" || p.category === "wellness") &&
      !(p.legal?.disclaimers || []).length) {
    W(`category "${p.category}" ships without a legal disclaimer — add one`);
  }

  /* fulfilment honesty */
  if (!isStr(p.shipping?.estimate)) W("shipping.estimate empty — buyers will assume fast shipping");
  if (!isStr(p.cta?.url) || p.cta.url === "#") W("cta.url is a placeholder — the page cannot take an order");

  return { ok: errors.length === 0, errors, warnings, gates };
}

/** Verdict for the research/audit CLIs: does this brief clear the money gates? */
export function verdict(p) {
  const { gates } = validate(p);
  const passed = ["priceBand", "margin", "momentum", "demoable"].filter((k) => gates[k] === true);
  const failed = ["priceBand", "margin", "momentum", "demoable"].filter((k) => gates[k] === false);
  return {
    score: Math.round((passed.length / 4) * 100),
    passed,
    failed,
    go: failed.length === 0,
  };
}
