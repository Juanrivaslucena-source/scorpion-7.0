/**
 * Audit tests. Run: node --test test/
 *
 * These drive a real browser, so they are slower than the unit tests. They
 * exist because a rule that does not fire is worse than no rule: each case
 * injects a specific violation and asserts the audit catches it.
 */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

import { auditFile } from "../dropship/audit.mjs";
import { build, contrast, accessibleOn } from "../dropship/build-page.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function exe() {
  const base = "/opt/pw-browsers";
  const dirs = fs.readdirSync(base);
  const d = dirs.find((x) => x.startsWith("chromium-")) || dirs.find((x) => x.startsWith("chromium_headless_shell"));
  const full = path.join(base, d, "chrome-linux", "chrome");
  return fs.existsSync(full) ? full : path.join(base, d, "chrome-linux", "headless_shell");
}

const brief = () => ({
  slug: "audit-fixture", name: "Fixture", tagline: "Does the thing.", category: "home",
  economics: { supplierCost: 3, shippingCost: 2, sellPrice: 27, compareAtPrice: 39, currency: "USD" },
  positioning: { problem: "It is annoying.", agitation: "The usual fix fails.", solution: "This fixes it.", demoIn3s: "Shown fast." },
  benefits: [{ icon: "◆", title: "One", body: "Does one." }],
  howItWorks: [{ step: "01", title: "Step", body: "Do it." }],
  specs: [{ label: "Material", value: "Silicone" }],
  faq: [{ q: "Shipping?", a: "Ships in 10-14 days." }],
  reviews: { rating: null, count: null, quotes: [] },
  guarantee: { returnDays: 30, text: "30-day returns." },
  shipping: { estimate: "Ships in 10-14 days." },
  cta: { primary: "Add to cart", url: "https://shop.example.com/cart" },
  brand: { storeName: "Shop", accent: "#8a6b52" },
  media: { heroImage: null, gallery: [] },
  legal: { disclaimers: [] },
});

let browser, tmp;
before(async () => {
  browser = await chromium.launch({ executablePath: exe() });
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "scorpion-audit-"));
});
after(async () => {
  if (browser) await browser.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

/** Write html to a temp file and audit it. */
async function auditHTML(html, name = "t.html") {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, html);
  return auditFile(f, browser);
}
const rules = (found, sev) => found.filter((f) => !sev || f.sev === sev).map((f) => f.rule);

/* ------------------------------------------------------------------------ */
describe("contrast helpers", () => {
  test("computes known ratios", () => {
    assert.equal(Math.round(contrast("#000000", "#ffffff")), 21);
    assert.equal(Math.round(contrast("#ffffff", "#ffffff")), 1);
  });

  test("accessibleOn lifts a failing accent to AA", () => {
    const fixed = accessibleOn("#8a6b52", "#1a1815", 4.5);
    assert.ok(contrast("#8a6b52", "#1a1815") < 4.5, "fixture must start failing");
    assert.ok(contrast(fixed, "#1a1815") >= 4.5, `got ${contrast(fixed, "#1a1815")}`);
  });

  test("accessibleOn leaves an already-passing colour untouched", () => {
    assert.equal(accessibleOn("#ffffff", "#1a1815", 4.5), "#ffffff");
  });

  test("accessibleOn handles 3-digit hex", () => {
    const c = accessibleOn("#333", "#000", 4.5);
    assert.ok(contrast(c, "#000") >= 4.5);
  });
});

describe("audit — generated pages", () => {
  test("a generated page passes with zero errors", async () => {
    const found = await auditHTML(build(brief()));
    const errs = found.filter((f) => f.sev === "error");
    assert.deepEqual(errs, [], "errors: " + JSON.stringify(errs, null, 1));
  });

  test("the FTC disclaimer is not mistaken for a claim", async () => {
    const b = brief();
    b.legal.disclaimers = [
      "This is not intended to diagnose, treat, cure, or prevent any condition.",
    ];
    const found = await auditHTML(build(b), "disc.html");
    assert.ok(!rules(found, "error").includes("regulated-claim"),
      "the standard disclaimer must not trip the claim rule");
  });

  test("a real regulated claim is still caught", async () => {
    const b = brief();
    b.positioning.solution = "This cures the problem for good.";
    const found = await auditHTML(build(b), "claim.html");
    assert.ok(rules(found, "error").includes("regulated-claim"));
  });
});

describe("audit — injected violations", () => {
  const page = (body, style = "") => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>t</title>
    <style>body{margin:0;background:#fff;color:#111;font:16px system-ui}
    .btn{display:inline-block;padding:14px 20px;background:#c2532b;color:#fff}${style}</style></head>
    <body>${body}</body></html>`;

  const ok = `<h1>Thing</h1><p>$27.00</p><a class="btn" href="https://x.example/cart">Add to cart</a>
    <p>30-day returns. Ships in 10-14 days.</p>`;

  test("clean control page produces no errors", async () => {
    const found = await auditHTML(page(ok), "ok.html");
    assert.deepEqual(found.filter((f) => f.sev === "error"), []);
  });

  test("catches manufactured urgency", async () => {
    const found = await auditHTML(page(ok + "<p>Only 3 left in stock!</p>"), "u.html");
    assert.ok(rules(found, "error").includes("fake-urgency"));
  });

  test("catches a viewer counter", async () => {
    const found = await auditHTML(page(ok + "<p>17 people are viewing this</p>"), "v.html");
    assert.ok(rules(found, "error").includes("fake-urgency"));
  });

  test("catches a rating with no quoted reviews", async () => {
    const found = await auditHTML(page(ok + "<p>4.8 / 5 from happy buyers</p>"), "r.html");
    assert.ok(rules(found, "error").includes("unsourced-rating"));
  });

  test("accepts a rating backed by a real quote", async () => {
    const found = await auditHTML(
      page(ok + "<p>4.8 / 5</p><blockquote>It works.</blockquote>"), "r2.html");
    assert.ok(!rules(found, "error").includes("unsourced-rating"));
  });

  test("catches a missing price", async () => {
    const found = await auditHTML(page(`<h1>Thing</h1><a class="btn" href="/cart">Buy</a>`), "np.html");
    assert.ok(rules(found, "error").includes("no-price"));
  });

  test("catches a page with no call to action", async () => {
    const found = await auditHTML(page(`<h1>Thing</h1><p>$27.00</p>`), "nc.html");
    assert.ok(rules(found, "error").includes("no-cta"));
  });

  test("warns on dead placeholder CTAs", async () => {
    const found = await auditHTML(page(`<h1>T</h1><p>$27.00</p><a class="btn" href="#">Buy</a>`), "dc.html");
    assert.ok(rules(found, "warning").includes("dead-cta"));
  });

  test("catches horizontal overflow", async () => {
    const found = await auditHTML(page(ok + `<div style="width:3000px">wide</div>`), "hz.html");
    assert.ok(rules(found, "error").includes("h-overflow"));
  });

  test("catches an image with no alt", async () => {
    const found = await auditHTML(page(ok + `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">`), "ia.html");
    assert.ok(rules(found, "error").includes("img-alt"));
  });

  test("catches failing text contrast", async () => {
    const found = await auditHTML(page(ok + `<p class="f">faint</p>`, ".f{color:#bbb;background:#fff}"), "ct.html");
    assert.ok(rules(found, "error").includes("contrast"));
  });

  test("groups repeated contrast failures by colour pair", async () => {
    const many = Array.from({ length: 20 }, (_, i) => `<p class="f">line ${i}</p>`).join("");
    const found = await auditHTML(page(ok + many, ".f{color:#bbb;background:#fff}"), "cg.html");
    const n = found.filter((f) => f.rule === "contrast").length;
    assert.ok(n <= 2, `20 identical failures should collapse, got ${n}`);
  });

  test("catches a console error", async () => {
    const found = await auditHTML(page(ok + `<script>null.x</script>`), "ce.html");
    assert.ok(rules(found, "error").includes("console"));
  });

  test("warns when guarantee language is absent", async () => {
    const found = await auditHTML(page(`<h1>T</h1><p>$27.00</p><a class="btn" href="/c">Buy</a>`), "ng.html");
    assert.ok(rules(found, "warning").includes("no-guarantee"));
  });
});

describe("shipped artefacts", () => {
  test("the example product page audits clean", async () => {
    const f = path.join(ROOT, "dropship/out/scalp-massager.html");
    if (!fs.existsSync(f)) return; // not generated in this environment
    const errs = (await auditFile(f, browser)).filter((x) => x.sev === "error");
    assert.deepEqual(errs, [], "errors: " + JSON.stringify(errs, null, 1));
  });

  test("the flagship demo audits with no integrity or quality errors", async () => {
    const f = path.join(ROOT, "showcase/lumen.html");
    const errs = (await auditFile(f, browser)).filter((x) => x.sev === "error");
    // Lumen is a service site, so commerce rules (price/CTA) do not apply.
    const relevant = errs.filter((e) => !["no-price", "no-cta"].includes(e.rule));
    assert.deepEqual(relevant, [], "errors: " + JSON.stringify(relevant, null, 1));
  });
});
