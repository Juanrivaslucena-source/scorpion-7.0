/**
 * Dropship pipeline tests.  Run: node --test test/
 *
 * Covers the rules that protect the business: no fabricated proof, no illegal
 * claims, no deceptive pricing, and honest gate scoring. These are the checks
 * that must not silently regress.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validate, verdict, GATES } from "../dropship/lib/schema.mjs";
import { scoreCandidate, rank, scaffold, WEIGHTS, HARD_GATES } from "../dropship/research.mjs";
import { buildKit } from "../dropship/content-kit.mjs";
import { build } from "../dropship/build-page.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal brief that passes validation — tests mutate clones of this. */
const base = () => ({
  slug: "test-item",
  name: "Test Item",
  tagline: "Does the thing.",
  category: "home",
  economics: { supplierCost: 3, shippingCost: 2, sellPrice: 27, compareAtPrice: 39, currency: "USD" },
  trend: { momentum: 70, sources: ["https://example.com/a"], checkedOn: "2026-07-29" },
  positioning: {
    problem: "It is annoying.", agitation: "The usual fix fails.",
    solution: "This fixes it.", demoIn3s: "Hand shows it working.",
    buyer: "Someone who cares.", objections: ["Does it work?"],
  },
  benefits: [
    { icon: "◆", title: "One", body: "Does one." },
    { icon: "✦", title: "Two", body: "Does two." },
    { icon: "❖", title: "Three", body: "Does three." },
  ],
  howItWorks: [
    { step: "01", title: "Step one", body: "Do this." },
    { step: "02", title: "Step two", body: "Then this." },
  ],
  specs: [{ label: "Material", value: "Silicone" }],
  faq: [{ q: "Shipping?", a: "10-14 days." }],
  reviews: { rating: null, count: null, quotes: [] },
  guarantee: { returnDays: 30, text: "30-day returns." },
  shipping: { estimate: "Ships in 10-14 days." },
  cta: { primary: "Add to cart", url: "https://shop.example.com/cart" },
  brand: { storeName: "Shop", accent: "#8a6b52" },
  media: { heroImage: null, gallery: [] },
  legal: { disclaimers: [] },
});

/* ------------------------------------------------------------------ schema */
describe("schema validation", () => {
  test("a complete brief validates", () => {
    const v = validate(base());
    assert.equal(v.ok, true, "errors: " + v.errors.join("; "));
  });

  test("requires slug, name, and sellPrice", () => {
    for (const [mutate, expect] of [
      [(b) => delete b.slug, /slug is required/],
      [(b) => delete b.name, /name is required/],
      [(b) => { b.economics.sellPrice = 0; }, /sellPrice/],
    ]) {
      const b = base(); mutate(b);
      const v = validate(b);
      assert.equal(v.ok, false);
      assert.ok(v.errors.some((e) => expect.test(e)), `expected ${expect} in ${v.errors}`);
    }
  });

  test("rejects non-kebab slugs", () => {
    const b = base(); b.slug = "Test_Item";
    assert.equal(validate(b).ok, false);
  });

  test("rejects a compare-at price that is not higher than the sell price", () => {
    const b = base(); b.economics.compareAtPrice = 20; // below sellPrice 27
    const v = validate(b);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /compareAtPrice/.test(e)));
  });

  test("rejects a rating with no quotes — no unsourced social proof", () => {
    const b = base(); b.reviews.rating = 4.8;
    const v = validate(b);
    assert.equal(v.ok, false);
    assert.ok(v.errors.some((e) => /rating is set with no quotes/.test(e)));
  });

  test("accepts a rating when real quotes back it", () => {
    const b = base();
    b.reviews = { rating: 4.6, count: 88, quotes: [{ text: "Works.", author: "A." }] };
    assert.equal(validate(b).ok, true);
  });

  test("rejects rating outside 0-5", () => {
    const b = base();
    b.reviews = { rating: 9, count: 1, quotes: [{ text: "x" }] };
    assert.equal(validate(b).ok, false);
  });

  for (const claim of ["cures", "clinically proven", "FDA-approved", "guaranteed results", "heals"]) {
    test(`rejects the regulated claim "${claim}"`, () => {
      const b = base(); b.positioning.solution = `This ${claim} the issue.`;
      const v = validate(b);
      assert.equal(v.ok, false, `"${claim}" should be rejected`);
      assert.ok(v.errors.some((e) => /unsubstantiated claim/.test(e)));
    });
  }

  for (const urgency of ["only 3 left", "12 people viewing", "selling out fast", "act now"]) {
    test(`rejects manufactured urgency "${urgency}"`, () => {
      const b = base(); b.tagline = `Buy today — ${urgency}!`;
      const v = validate(b);
      assert.equal(v.ok, false, `"${urgency}" should be rejected`);
      assert.ok(v.errors.some((e) => /manufactured urgency/.test(e)));
    });
  }

  test("warns when a beauty product ships without a disclaimer", () => {
    const b = base(); b.category = "beauty"; b.legal.disclaimers = [];
    assert.ok(validate(b).warnings.some((w) => /disclaimer/.test(w)));
  });

  test("warns on a placeholder checkout url", () => {
    const b = base(); b.cta.url = "#";
    assert.ok(validate(b).warnings.some((w) => /cannot take an order/.test(w)));
  });

  test("warns on missing shipping estimate", () => {
    const b = base(); b.shipping.estimate = "";
    assert.ok(validate(b).warnings.some((w) => /shipping\.estimate/.test(w)));
  });

  test("computes the margin multiple on landed cost", () => {
    const v = validate(base());              // 27 / (3 + 2) = 5.4
    assert.equal(v.gates.marginMultiple, 5.4);
    assert.equal(v.gates.margin, true);
  });

  test("flags sub-3x margin", () => {
    const b = base(); b.economics.sellPrice = 12; // 12/5 = 2.4x
    const v = validate(b);
    assert.equal(v.gates.margin, false);
    assert.ok(v.warnings.some((w) => /below the 3x floor/.test(w)));
  });

  test("flags a price outside the impulse band", () => {
    const b = base(); b.economics.sellPrice = 120;
    assert.equal(validate(b).gates.priceBand, false);
  });

  test("verdict() reports go only when every money gate passes", () => {
    assert.equal(verdict(base()).go, true);
    const b = base(); b.trend.momentum = 20;
    const bad = verdict(b);
    assert.equal(bad.go, false);
    assert.ok(bad.failed.includes("momentum"));
  });

  test("gate constants stay at their documented values", () => {
    assert.deepEqual(GATES, { PRICE_MIN: 20, PRICE_MAX: 40, MARGIN_MIN: 3, MOMENTUM_MIN: 60 });
  });

  test("a non-object brief fails safely instead of throwing", () => {
    assert.equal(validate(null).ok, false);
    assert.equal(validate("nope").ok, false);
  });
});

/* ---------------------------------------------------------------- research */
describe("research scoring", () => {
  const cand = (o = {}) => ({
    id: "c1", name: "Candidate", supplierCost: 3, shippingCost: 2, sellPrice: 27,
    momentum: 75, demoIn3s: "Shows instantly.", problem: "A real problem.",
    sources: ["https://example.com"], ...o,
  });

  test("a strong candidate scores GO", () => {
    const r = scoreCandidate(cand());
    assert.equal(r.verdict, "GO");
    assert.equal(r.score, 100);
    assert.equal(r.marginMultiple, 5.4);
  });

  test("no 3-second demo is a hard veto regardless of score", () => {
    const r = scoreCandidate(cand({ demoIn3s: "" }));
    assert.equal(r.verdict, "REJECT");
    assert.ok(r.vetoed.includes("demoable"));
  });

  test("sub-3x margin is a hard veto", () => {
    const r = scoreCandidate(cand({ sellPrice: 10 }));
    assert.equal(r.verdict, "REJECT");
    assert.ok(r.vetoed.includes("margin"));
  });

  test("unknown fields neither reward nor penalise", () => {
    const r = scoreCandidate(cand({ momentum: undefined }));
    assert.notEqual(r.verdict, "REJECT");
    assert.ok(r.reasons.some((x) => /momentum unscored/.test(x)));
  });

  test("every rejection states a reason", () => {
    const r = scoreCandidate(cand({ demoIn3s: "", sellPrice: 10, momentum: 10 }));
    assert.ok(r.reasons.length >= 3);
  });

  test("unsourced trend claims are called out", () => {
    assert.ok(scoreCandidate(cand({ sources: [] })).reasons.some((x) => /unsourced/.test(x)));
  });

  test("rank puts GO before WATCH before REJECT", () => {
    const rows = rank([
      cand({ id: "reject", demoIn3s: "" }),
      cand({ id: "go" }),
      cand({ id: "weak", momentum: 30, problem: "" }),
    ]);
    assert.equal(rows[0].id, "go");
    assert.equal(rows[rows.length - 1].id, "reject");
  });

  test("weights sum to 100 and hard gates are weighted highest", () => {
    assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
    for (const g of HARD_GATES) {
      assert.ok(WEIGHTS[g] >= 25, `${g} should carry real weight`);
    }
  });

  test("scaffold produces a slug and marks unverified fields null", () => {
    const b = scaffold({ name: "Scalp Relief Brush", sellPrice: 27 });
    assert.equal(b.slug, "scalp-relief-brush");
    assert.equal(b.source.listingUrl, null);
    assert.deepEqual(b.reviews.quotes, []);
    assert.match(b._status, /UNVERIFIED/);
  });

  test("a scaffold carries no invented proof", () => {
    const b = scaffold({ name: "X" });
    assert.equal(b.reviews.rating, null);
    assert.equal(b.source.supplierRating, null);
  });
});

/* ------------------------------------------------------------- content kit */
describe("content kit", () => {
  test("generates hooks, scripts, ads and captions", () => {
    const { counts } = buildKit(base());
    assert.ok(counts.hooks >= 5, `hooks: ${counts.hooks}`);
    assert.ok(counts.scripts >= 2, `scripts: ${counts.scripts}`);
    assert.ok(counts.ads >= 3, `ads: ${counts.ads}`);
    assert.ok(counts.captions >= 2);
  });

  test("skips angles whose source field is empty instead of inventing them", () => {
    const b = base();
    b.positioning.demoIn3s = "";
    b.positioning.objections = [];
    const { md, counts } = buildKit(b);
    assert.ok(counts.skipped >= 2);
    assert.match(md, /## Skipped angles/);
  });

  test("omits the price-anchor hook when there is no compare-at price", () => {
    const b = base(); delete b.economics.compareAtPrice;
    const { md } = buildKit(b);
    const hooks = md.slice(md.indexOf("## Hooks"), md.indexOf("## Video scripts"));
    assert.doesNotMatch(hooks, /price-anchor/, "hook must not be offered");
    assert.match(md, /Skipped angles[\s\S]*price-anchor/, "and must be reported as skipped");
  });

  test("never emits fabricated testimonials", () => {
    const { md } = buildKit(base());
    assert.doesNotMatch(md, /\b(5 stars|★|amazing product|life[- ]changing)\b/i);
  });

  test("carries the do-not-use rules into the kit", () => {
    const md = buildKit(base()).md;
    assert.match(md, /No invented testimonials/);
    assert.match(md, /No countdown timers/);
    assert.match(md, /No medical claims/);
  });

  test("flags a missing shipping estimate in the DM script rather than guessing", () => {
    const b = base(); b.shipping.estimate = "";
    assert.match(buildKit(b).md, /FILL shipping\.estimate/);
  });

  test("script beats include timing and shot direction", () => {
    const md = buildKit(base()).md;
    assert.match(md, /\| Time \| Line \| Shot \|/);
    assert.match(md, /0:00–0:03/);
  });
});

/* --------------------------------------------------------------- page build */
describe("landing page", () => {
  const html = () => build(base());

  test("emits a complete document", () => {
    const h = html();
    assert.match(h, /^<!DOCTYPE html>/);
    assert.match(h, /<\/html>\s*$/);
    assert.match(h, /<title>Test Item/);
  });

  test("omits the review section when there are no real reviews", () => {
    assert.doesNotMatch(html(), /<blockquote/);
  });

  test("renders reviews when real quotes exist", () => {
    const b = base();
    b.reviews = { rating: 4.6, count: 88, quotes: [{ text: "It works.", author: "A." }] };
    const h = build(b);
    assert.match(h, /<blockquote/);
    assert.match(h, /It works\./);
  });

  test("contains no manufactured urgency", () => {
    assert.doesNotMatch(html(), /only \d+ left|people viewing|hurry|act now|countdown/i);
  });

  test("contains no timer or stock-counter script", () => {
    assert.doesNotMatch(html(), /setInterval|countdown|stockLeft/i);
  });

  test("makes no external requests", () => {
    const h = html();
    assert.doesNotMatch(h, /<script[^>]+src=/i);
    assert.doesNotMatch(h, /<link[^>]+href=["']http/i);
    assert.doesNotMatch(h, /https?:\/\/(?!shop\.example\.com)[^"'\s)]+\.(js|css|woff2?|png|jpg)/i);
  });

  test("escapes HTML in brief content", () => {
    const b = base();
    b.name = '<script>alert("x")</script>';
    const h = build(b);
    assert.doesNotMatch(h, /<script>alert/);
    assert.match(h, /&lt;script&gt;/);
  });

  test("computes the savings badge from real prices", () => {
    assert.match(html(), /SAVE 31%/);           // 1 - 27/39
  });

  test("omits the savings badge with no compare-at price", () => {
    const b = base(); delete b.economics.compareAtPrice;
    assert.doesNotMatch(build(b), /SAVE/);
  });

  test("includes a reduced-motion path", () => {
    assert.match(html(), /prefers-reduced-motion/);
  });

  test("includes the legal disclaimer when present", () => {
    const b = base(); b.legal.disclaimers = ["Not a medical device."];
    assert.match(build(b), /Not a medical device\./);
  });

  test("points the CTA at the supplied checkout url", () => {
    assert.match(html(), /https:\/\/shop\.example\.com\/cart/);
  });

  test("uses generated art when no product photo is supplied", () => {
    assert.match(html(), /data:image\/svg\+xml/);
  });

  test("omits sections whose data is absent", () => {
    const b = base();
    b.specs = []; b.faq = []; b.howItWorks = [];
    const h = build(b);
    assert.doesNotMatch(h, /Specifications/);
    assert.doesNotMatch(h, /How it works/);
    assert.doesNotMatch(h, /<details/);
  });
});

/* -------------------------------------------------------------- repo state */
describe("repository invariants", () => {
  test("no runtime dependencies are declared", () => {
    const pkg = path.join(ROOT, "package.json");
    if (!fs.existsSync(pkg)) return;                       // no manifest is fine
    const j = JSON.parse(fs.readFileSync(pkg, "utf8"));
    assert.deepEqual(j.dependencies || {}, {},
      "the pipeline must stay dependency-free at runtime");
  });

  test("the shipped example brief validates", () => {
    const f = path.join(ROOT, "dropship/products/scalp-massager.json");
    const v = validate(JSON.parse(fs.readFileSync(f, "utf8")));
    assert.equal(v.ok, true, "errors: " + v.errors.join("; "));
  });

  test("the example brief claims no unverified supplier data", () => {
    const f = path.join(ROOT, "dropship/products/scalp-massager.json");
    const p = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.equal(p.source.listingUrl, null);
    assert.equal(p.reviews.rating, null);
    assert.match(p._status, /EXAMPLE|UNVERIFIED|unverified/);
  });

  test("the template brief carries the no-fake-reviews rule", () => {
    const f = path.join(ROOT, "dropship/products/_TEMPLATE.json");
    const raw = fs.readFileSync(f, "utf8");
    assert.match(raw, /Never invent testimonials/);
  });
});
