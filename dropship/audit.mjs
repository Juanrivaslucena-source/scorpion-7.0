/**
 * Page audit — the gate before anything gets traffic.
 *
 *   node dropship/audit.mjs dropship/out/<slug>.html
 *   node dropship/audit.mjs --all
 *
 * Renders the page in real Chromium at desktop and mobile and inspects the live
 * DOM. Three rule families:
 *
 *   integrity   — fabricated proof, manufactured urgency, regulated claims
 *   conversion  — missing price, dead CTA, no guarantee, buried call to action
 *   quality     — contrast, tap targets, overflow, alt text, console errors
 *
 * Integrity failures are errors and always block. Fix the page; never relax a
 * rule to clear a finding.
 */
import { chromium } from "playwright-core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { launchOptions } from "./lib/browser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* Rules evaluated inside the page. Returns findings as plain objects so they
 * serialise across the CDP boundary. */
function inPageRules() {
  const out = [];
  const add = (sev, rule, msg, sel) => out.push({ sev, rule, msg, sel });

  const text = document.body.innerText;

  /* ---- integrity ---- */
  const urgency = /only \d+ left|\d+ people (are )?(viewing|watching)|selling out fast|hurry|act now|limited time only/i;
  if (urgency.test(text)) add("error", "fake-urgency", `manufactured urgency: "${text.match(urgency)[0]}"`, "body");

  // Regulated claims — but the standard FTC disclaimer legitimately contains
  // "diagnose, treat, cure, or prevent". Judge each sentence, and skip ones
  // where the claim is negated or is part of that boilerplate.
  const claim = /\b(cures?|heals?|clinically proven|FDA[- ]approved|guaranteed results?|miracle)\b/i;
  const NEGATED = /\b(not intended to|does not|is not|no claim|makes no|nor)\b/i;
  const DISCLAIMER = /diagnose,?\s*treat,?\s*cure/i;
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const m = sentence.match(claim);
    if (!m) continue;
    if (NEGATED.test(sentence) || DISCLAIMER.test(sentence)) continue;
    add("error", "regulated-claim", `unsubstantiated claim: "${m[0]}"`, "body");
    break;
  }

  // A star rating with no quoted review behind it.
  const stars = /([0-9.]+)\s*(\/\s*5|stars?|★)/i;
  if (stars.test(text) && document.querySelectorAll("blockquote").length === 0) {
    add("error", "unsourced-rating", "a rating is shown with no quoted reviews", "body");
  }
  if (document.querySelector("[data-countdown], .countdown, #countdown")) {
    add("error", "countdown", "countdown element present", ".countdown");
  }

  /* ---- conversion ---- */
  const ctas = [...document.querySelectorAll("a.btn, button.btn, a[href*='cart'], a[href*='checkout']")];
  if (!ctas.length) add("error", "no-cta", "no call to action found", "body");
  const dead = ctas.filter((a) => a.tagName === "A" && (!a.getAttribute("href") || a.getAttribute("href") === "#"));
  if (dead.length === ctas.length && ctas.length > 0) {
    add("warning", "dead-cta", `all ${ctas.length} CTAs point at "#" — the page cannot take an order`, "a.btn");
  }
  if (!/[$€£]\s?\d/.test(text)) add("error", "no-price", "no price visible on the page", "body");

  // The primary CTA must be reachable without scrolling far.
  if (ctas.length) {
    const top = ctas[0].getBoundingClientRect().top + window.scrollY;
    if (top > window.innerHeight * 1.5) {
      add("warning", "buried-cta", `first CTA is ${Math.round(top)}px down — beyond 1.5 screens`, "a.btn");
    }
  }
  if (!/return|refund|guarantee|warranty/i.test(text)) {
    add("warning", "no-guarantee", "no return or guarantee language — a known conversion drag on unknown brands", "body");
  }
  if (!/ship|deliver/i.test(text)) {
    add("warning", "no-shipping", "no shipping information", "body");
  }

  /* ---- quality ---- */
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    add("error", "h-overflow",
      `page scrolls horizontally (${document.documentElement.scrollWidth} > ${window.innerWidth})`, "html");
  }

  const imgs = [...document.querySelectorAll("img")];
  const noAlt = imgs.filter((i) => !i.hasAttribute("alt"));
  if (noAlt.length) add("error", "img-alt", `${noAlt.length} image(s) missing alt`, "img");

  // Tap targets on mobile widths.
  if (window.innerWidth < 500) {
    const small = [...document.querySelectorAll("a, button, summary")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.height < 44;
    });
    if (small.length) {
      add("warning", "tap-target",
        `${small.length} interactive element(s) under 44px tall`, small[0].className || small[0].tagName);
    }
  }

  /* contrast — sampled, with backdrop memoised */
  const lum = (c) => {
    const m = c.match(/\d+(\.\d+)?/g);
    if (!m) return null;
    const [r, g, b] = m.slice(0, 3).map(Number);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgCache = new Map();
  const backdrop = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      if (bgCache.has(n)) return bgCache.get(n);
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && !/rgba?\([^)]*,\s*0\)/.test(bg) && bg !== "transparent") {
        bgCache.set(el, bg); return bg;
      }
      n = n.parentElement;
    }
    return "rgb(255,255,255)";
  };
  const seen = new Map();
  for (const el of [...document.querySelectorAll("p,li,span,h1,h2,h3,dt,dd,cite,summary,a")].slice(0, 400)) {
    if (!el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.1) continue;
    const fg = lum(cs.color), bg = lum(backdrop(el));
    if (fg == null || bg == null) continue;
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      // Group by colour pair — one variable, not N findings.
      const key = cs.color + "|" + backdrop(el);
      if (!seen.has(key)) {
        seen.set(key, true);
        add("error", "contrast",
          `${cs.color} on ${backdrop(el)} is ${ratio.toFixed(2)}:1, needs ${need}:1`, el.tagName.toLowerCase());
      }
    }
  }

  return out;
}

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

export async function auditFile(file, browser) {
  const url = "file://" + path.resolve(file);
  const findings = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const consoleErrs = [];
    page.on("pageerror", (e) => consoleErrs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") consoleErrs.push(m.text()); });
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(500);
    // Settle scroll-triggered content so nothing is judged mid-animation.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    const res = await page.evaluate(inPageRules);
    res.forEach((f) => findings.push({ ...f, viewport: vp.name }));
    consoleErrs.forEach((e) =>
      findings.push({ sev: "error", rule: "console", msg: e, sel: "", viewport: vp.name }));
    await ctx.close();
  }
  // Collapse a finding reported identically on both viewports.
  const byKey = new Map();
  for (const f of findings) {
    const k = f.rule + "|" + f.msg;
    if (byKey.has(k)) byKey.get(k).viewport += ", " + f.viewport;
    else byKey.set(k, { ...f });
  }
  return [...byKey.values()];
}

/* -------------------------------------------------------------------- cli */
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  const outDir = path.join(ROOT, "dropship/out");
  let files;
  if (arg === "--all") {
    files = fs.existsSync(outDir)
      ? fs.readdirSync(outDir).filter((f) => f.endsWith(".html")).map((f) => path.join(outDir, f))
      : [];
  } else if (arg) files = [arg];
  else { console.error("usage: node dropship/audit.mjs <page.html> | --all"); process.exit(2); }

  if (!files.length) { console.error("no pages to audit — generate one first"); process.exit(1); }

  const browser = await chromium.launch(launchOptions());
  let errors = 0, warnings = 0;
  for (const f of files) {
    const found = await auditFile(f, browser);
    const errs = found.filter((x) => x.sev === "error");
    const warns = found.filter((x) => x.sev === "warning");
    errors += errs.length; warnings += warns.length;
    console.log(`\n${path.basename(f)} — ${errs.length ? `${errs.length} error(s)` : "clean"}${warns.length ? `, ${warns.length} warning(s)` : ""}`);
    for (const x of [...errs, ...warns]) {
      console.log(`  ${x.sev === "error" ? "✗" : "!"} [${x.rule}] ${x.msg}  (${x.viewport})`);
    }
  }
  await browser.close();
  console.log(`\n${errors} error(s), ${warnings} warning(s) across ${files.length} page(s)`);
  process.exit(errors ? 1 : 0);
}
