/**
 * Product brief -> conversion landing page.
 *
 *   node dropship/build-page.mjs dropship/products/<slug>.json [outdir]
 *
 * Emits one self-contained HTML file: no external requests, no frameworks,
 * no tracking pixels baked in. Sections whose data is null are OMITTED rather
 * than filled with invented content.
 *
 * Hard rules enforced here, not left to discipline:
 *   - No testimonials or star ratings unless real ones are supplied.
 *   - No countdown timers, fake stock counters, or "N people viewing".
 *   - Shipping estimate is printed as given; nothing is promised on its behalf.
 */
import fs from "fs";
import path from "path";
import { validate } from "./lib/schema.mjs";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (n, cur = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).format(n);

/* --- contrast ------------------------------------------------------------
 * A brand accent chosen for buttons (dark text on light) will usually fail
 * WCAG AA when reused as text on the dark closing section. Rather than ship a
 * failure or hard-code a second colour, derive an accessible variant: lighten
 * the accent until it clears 4.5:1 against the dark ground.
 */
const hex2rgb = (h) => {
  const s = h.replace("#", "");
  const n = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const rgb2hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const relLum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a, b) => {
  const [l1, l2] = [relLum(hex2rgb(a)), relLum(hex2rgb(b))];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
/** Lightest-touch adjustment of `accent` that reaches `target` contrast on `bg`. */
export function accessibleOn(accent, bg, target = 4.5) {
  if (contrast(accent, bg) >= target) return accent;
  let [r, g, b] = hex2rgb(accent);
  for (let i = 0; i < 100; i++) {
    // Move toward white in small steps; preserves hue far better than a jump to #fff.
    r += (255 - r) * 0.06; g += (255 - g) * 0.06; b += (255 - b) * 0.06;
    const c = rgb2hex(r, g, b);
    if (contrast(c, bg) >= target) return c;
  }
  return "#ffffff";
}

/** Abstract product-shape art. Used only when no real photo is supplied — a
 *  neutral placeholder never implies a product look we can't back up. */
function artSVG(accent, seed = 1) {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='900' height='900'>` +
    `<defs><radialGradient id='g' cx='38%' cy='32%'>` +
    `<stop offset='0%' stop-color='${accent}' stop-opacity='.30'/>` +
    `<stop offset='100%' stop-color='${accent}' stop-opacity='0'/></radialGradient></defs>` +
    `<rect width='100%' height='100%' fill='#f4f1ec'/><rect width='100%' height='100%' fill='url(#g)'/>` +
    `<circle cx='450' cy='430' r='${180 + seed * 14}' fill='none' stroke='#1a1815' stroke-opacity='.13'/>` +
    `<circle cx='450' cy='430' r='${250 + seed * 10}' fill='none' stroke='#1a1815' stroke-opacity='.08'/>` +
    `<text x='50%' y='51%' font-family='Georgia,serif' font-size='40' fill='#1a1815' fill-opacity='.32'` +
    ` text-anchor='middle'>product image</text></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function build(p) {
  const e = p.economics || {};
  const cur = e.currency || "USD";
  const accent = (p.brand && p.brand.accent) || "#c2532b";
  const INK = "#1a1815";
  // Accent as text on the dark closing section must clear AA on its own.
  const accentOnDark = accessibleOn(accent, INK, 4.5);
  const pos = p.positioning || {};
  const rv = p.reviews || {};
  const hasReviews = !!(rv.quotes && rv.quotes.length && rv.rating);
  const hero = (p.media && p.media.heroImage) || artSVG(accent, 1);
  const gallery = (p.media && p.media.gallery && p.media.gallery.length)
    ? p.media.gallery
    : [artSVG(accent, 2), artSVG(accent, 3), artSVG(accent, 4)];
  const save = e.compareAtPrice && e.sellPrice
    ? Math.round((1 - e.sellPrice / e.compareAtPrice) * 100) : null;

  const sec = [];

  /* problem / agitation */
  if (pos.problem) sec.push(`
  <section class="s pad">
    <div class="w narrow">
      <p class="tag rv">The problem</p>
      <h2 class="rv">${esc(pos.problem)}</h2>
      ${pos.agitation ? `<p class="lead rv">${esc(pos.agitation)}</p>` : ""}
      ${pos.solution ? `<p class="lead rv solution">${esc(pos.solution)}</p>` : ""}
    </div>
  </section>`);

  /* how it works */
  if (p.howItWorks && p.howItWorks.length) sec.push(`
  <section class="s pad alt">
    <div class="w">
      <p class="tag rv">How it works</p>
      <div class="steps">
        ${p.howItWorks.map((s) => `
        <div class="step rv">
          <span class="n">${esc(s.step)}</span>
          <h3>${esc(s.title)}</h3>
          ${s.body ? `<p>${esc(s.body)}</p>` : ""}
        </div>`).join("")}
      </div>
    </div>
  </section>`);

  /* benefits */
  if (p.benefits && p.benefits.length) sec.push(`
  <section class="s pad">
    <div class="w">
      <p class="tag rv">Why it works</p>
      <div class="bens">
        ${p.benefits.map((b) => `
        <div class="ben rv">
          <span class="ico">${esc(b.icon || "◆")}</span>
          <h3>${esc(b.title)}</h3>
          <p>${esc(b.body)}</p>
        </div>`).join("")}
      </div>
    </div>
  </section>`);

  /* gallery */
  sec.push(`
  <section class="s pad alt">
    <div class="w">
      <div class="gal">
        ${gallery.slice(0, 3).map((g) => `<img class="rv" src="${esc(g)}" alt="${esc(p.name)}" loading="lazy" />`).join("")}
      </div>
    </div>
  </section>`);

  /* specs */
  if (p.specs && p.specs.length) sec.push(`
  <section class="s pad">
    <div class="w narrow">
      <p class="tag rv">Specifications</p>
      <dl class="specs rv">
        ${p.specs.filter((s) => s.value).map((s) =>
          `<div><dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd></div>`).join("")}
      </dl>
    </div>
  </section>`);

  /* reviews — real only */
  if (hasReviews) sec.push(`
  <section class="s pad alt">
    <div class="w">
      <p class="tag rv">What buyers say</p>
      <p class="rating rv">${esc(rv.rating)} / 5${rv.count ? ` · ${esc(rv.count)} reviews` : ""}</p>
      <div class="quotes">
        ${rv.quotes.map((q) => `
        <blockquote class="rv"><p>${esc(q.text || q)}</p>
        ${q.author ? `<cite>${esc(q.author)}</cite>` : ""}</blockquote>`).join("")}
      </div>
    </div>
  </section>`);

  /* faq */
  const faq = (p.faq || []).filter((f) => f.a);
  if (faq.length) sec.push(`
  <section class="s pad">
    <div class="w narrow">
      <p class="tag rv">Questions</p>
      ${faq.map((f) => `
      <details class="faq rv"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
    </div>
  </section>`);

  /* guarantee + final cta */
  const g = p.guarantee || {};
  sec.push(`
  <section class="s pad final">
    <div class="w narrow center">
      ${g.text ? `<p class="guar rv">${esc(g.text)}</p>` : ""}
      <h2 class="rv">${esc(p.tagline || p.name)}</h2>
      <p class="price big rv">${e.sellPrice ? money(e.sellPrice, cur) : ""}</p>
      <a class="btn lg rv" href="${esc((p.cta && p.cta.url) || "#")}">${esc((p.cta && p.cta.primary) || "Add to cart")}</a>
      ${(p.shipping && p.shipping.estimate) ? `<p class="ship rv">${esc(p.shipping.estimate)}</p>` : ""}
    </div>
  </section>`);

  const disc = (p.legal && p.legal.disclaimers) || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(p.name)}${p.brand && p.brand.storeName ? " — " + esc(p.brand.storeName) : ""}</title>
<meta name="description" content="${esc(p.tagline || "")}" />
<style>
:root{--ink:#1a1815;--soft:#5c5850;--paper:#fbf9f6;--card:#fff;--line:rgba(26,24,21,.12);
 --accent:${accent};--accent-dk:${accentOnDark};--serif:"Iowan Old Style",Palatino,Georgia,serif;
 --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Helvetica,Arial,sans-serif;
 --ease:cubic-bezier(.22,1,.36,1)}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased}
h1,h2,h3{font-family:var(--serif);font-weight:400;letter-spacing:-.022em;margin:0;line-height:1.1}
img{max-width:100%;display:block}
.w{width:min(1140px,92vw);margin:0 auto}.narrow{max-width:66ch}.center{text-align:center}
.pad{padding:clamp(56px,8vw,110px) 0}.alt{background:var(--card)}
.bar{background:var(--ink);color:var(--paper);text-align:center;padding:11px 16px;font-size:13px;letter-spacing:.03em}
.tag{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--accent);margin:0 0 20px}
h2{font-size:clamp(26px,4.2vw,44px)}
.lead{font-size:clamp(16px,1.8vw,19px);line-height:1.75;color:var(--soft);margin:20px 0 0}
.solution{color:var(--ink);font-weight:500}
.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:16px 34px;
 border-radius:4px;font-weight:600;font-size:15px;letter-spacing:.02em;border:none;cursor:pointer;
 transition:transform .2s var(--ease),filter .2s var(--ease)}
.btn:hover{transform:translateY(-2px);filter:brightness(1.07)}
.btn.lg{padding:19px 46px;font-size:17px}
/* hero */
.hero{display:grid;grid-template-columns:1.05fr 1fr;gap:clamp(28px,5vw,72px);align-items:center;
 padding:clamp(34px,5vw,64px) 0 clamp(48px,7vw,86px)}
.hero img{border-radius:8px;background:var(--card)}
h1{font-size:clamp(32px,5.4vw,58px)}
.sub{font-size:clamp(16px,1.9vw,20px);color:var(--soft);line-height:1.65;margin:18px 0 26px}
.prow{display:flex;align-items:baseline;gap:14px;margin-bottom:8px;flex-wrap:wrap}
.price{font-family:var(--serif);font-size:38px;letter-spacing:-.02em}
.was{color:var(--soft);text-decoration:line-through;font-size:19px}
.save{background:var(--accent);color:#fff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:3px;letter-spacing:.04em}
.trust{display:flex;gap:20px;flex-wrap:wrap;margin-top:22px;font-size:13.5px;color:var(--soft)}
.trust span::before{content:"✓";color:var(--accent);font-weight:700;margin-right:7px}
/* steps + benefits */
.steps,.bens{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(22px,3vw,42px);margin-top:40px}
.step .n{font-size:12px;letter-spacing:.2em;color:var(--accent)}
.step h3,.ben h3{font-size:20px;margin:12px 0 9px}
.step p,.ben p{margin:0;color:var(--soft);font-size:15.5px;line-height:1.65}
.ben .ico{font-size:24px;color:var(--accent)}
.gal{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.gal img{border-radius:6px;aspect-ratio:1;object-fit:cover;background:var(--paper)}
/* specs / reviews / faq */
.specs{margin:34px 0 0;border-top:1px solid var(--line)}
.specs>div{display:flex;justify-content:space-between;gap:20px;padding:15px 0;border-bottom:1px solid var(--line)}
.specs dt{color:var(--soft);font-size:14.5px;margin:0}.specs dd{margin:0;font-size:14.5px;text-align:right}
.rating{font-family:var(--serif);font-size:26px;margin:0 0 24px}
.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
blockquote{margin:0;background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:24px}
blockquote p{margin:0 0 12px;font-size:15.5px;line-height:1.65}
cite{font-style:normal;font-size:12.5px;color:var(--soft);letter-spacing:.04em}
.faq{border-bottom:1px solid var(--line);padding:18px 0}
.faq summary{cursor:pointer;font-size:16.5px;font-weight:500;list-style:none;display:flex;justify-content:space-between;gap:16px}
.faq summary::after{content:"+";color:var(--accent);font-size:21px;line-height:1}
.faq[open] summary::after{content:"−"}
.faq p{margin:14px 0 0;color:var(--soft);line-height:1.7;font-size:15.5px}
.final{background:var(--ink);color:var(--paper)}
.final h2{margin:14px 0 18px}.final .price{font-size:44px}
.guar{color:var(--accent-dk);font-size:14px;letter-spacing:.03em;margin:0}
.ship{color:rgba(251,249,246,.6);font-size:13.5px;margin:18px 0 0}
.big{margin:0 0 26px}
/* sticky buy */
.sticky{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--card);
 border-top:1px solid var(--line);padding:12px 16px;display:flex;align-items:center;
 justify-content:space-between;gap:16px;transform:translateY(105%);transition:transform .4s var(--ease);
 box-shadow:0 -6px 26px rgba(0,0,0,.09)}
.sticky.on{transform:none}
.sticky .nm{font-size:14.5px;font-weight:600}.sticky .pc{color:var(--soft);font-size:13.5px}
footer{background:var(--ink);color:rgba(251,249,246,.55);padding:40px 0;font-size:13px;border-top:1px solid rgba(255,255,255,.08)}
footer a{color:rgba(251,249,246,.8)}
.disc{margin-top:14px;font-size:11.5px;line-height:1.7;opacity:.7}
.rv{opacity:0;transform:translateY(22px);transition:opacity .8s var(--ease),transform .8s var(--ease)}
.rv.in{opacity:1;transform:none}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
@media(max-width:860px){.hero,.steps,.bens{grid-template-columns:1fr}.gal{grid-template-columns:1fr 1fr}}
/* WCAG 2.5.8: interactive targets stay finger-sized on touch screens */
@media(max-width:500px){.faq summary{min-height:44px;align-items:center}
 footer a,.trust span{display:inline-flex;align-items:center;min-height:44px}
 .btn{min-height:48px;display:inline-flex;align-items:center;justify-content:center}}
@media(prefers-reduced-motion:reduce){*{transition-duration:.001ms!important;animation:none!important}
 .rv{opacity:1!important;transform:none!important}}
</style>
</head>
<body>
${(p.shipping && p.shipping.estimate) || g.returnDays ? `<div class="bar">${
  [p.shipping && p.shipping.estimate, g.returnDays ? `${g.returnDays}-day returns` : null]
    .filter(Boolean).map(esc).join(" · ")}</div>` : ""}

<main>
<div class="w hero">
  <img src="${esc(hero)}" alt="${esc(p.name)}" width="900" height="900" />
  <div>
    <h1>${esc(p.name)}</h1>
    <p class="sub">${esc(p.tagline || "")}</p>
    <div class="prow">
      ${e.sellPrice ? `<span class="price">${money(e.sellPrice, cur)}</span>` : ""}
      ${e.compareAtPrice ? `<span class="was">${money(e.compareAtPrice, cur)}</span>` : ""}
      ${save ? `<span class="save">SAVE ${save}%</span>` : ""}
    </div>
    <a class="btn lg" href="${esc((p.cta && p.cta.url) || "#")}" id="buy">${esc((p.cta && p.cta.primary) || "Add to cart")}</a>
    <div class="trust">
      ${g.returnDays ? `<span>${esc(g.returnDays)}-day returns</span>` : ""}
      ${(p.shipping && p.shipping.estimate) ? `<span>${esc(p.shipping.estimate)}</span>` : ""}
      ${(p.source && p.source.supplierRating) ? `<span>${esc(p.source.supplierRating)}★ supplier rating</span>` : ""}
    </div>
  </div>
</div>
${sec.join("\n")}
</main>

<footer>
  <div class="w">
    <div>© ${new Date().getFullYear()} ${esc((p.brand && p.brand.storeName) || "Store")}${
      p.brand && p.brand.supportEmail ? ` · <a href="mailto:${esc(p.brand.supportEmail)}">${esc(p.brand.supportEmail)}</a>` : ""}</div>
    ${disc.length ? `<div class="disc">${disc.map(esc).join("<br>")}</div>` : ""}
  </div>
</footer>

<div class="sticky" id="sb">
  <div><div class="nm">${esc(p.name)}</div><div class="pc">${e.sellPrice ? money(e.sellPrice, cur) : ""}</div></div>
  <a class="btn" href="${esc((p.cta && p.cta.url) || "#")}">${esc((p.cta && p.cta.primary) || "Add to cart")}</a>
</div>

<script>
(function(){
  var io=new IntersectionObserver(function(es){es.forEach(function(e){
    if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}});},{threshold:.12});
  document.querySelectorAll(".rv").forEach(function(e){io.observe(e);});
  var sb=document.getElementById("sb"),buy=document.getElementById("buy");
  if(sb&&buy){var bo=new IntersectionObserver(function(es){
    sb.classList.toggle("on",!es[0].isIntersecting);},{threshold:0});bo.observe(buy);}
})();
</script>
</body>
</html>
`;
}

export { build };

/* ---- cli ---- */
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node dropship/build-page.mjs <product.json> [outdir]");
    process.exit(2);
  }
  const p = JSON.parse(fs.readFileSync(file, "utf8"));

  // Validation gate — a brief with errors never becomes a page.
  const v = validate(p);
  if (!v.ok) {
    console.error("✗ brief invalid — refusing to generate:");
    v.errors.forEach((e) => console.error("  - " + e));
    process.exit(1);
  }

  const outdir = process.argv[3] || path.join(path.dirname(file), "..", "out");
  fs.mkdirSync(outdir, { recursive: true });
  const out = path.join(outdir, (p.slug || "product") + ".html");
  fs.writeFileSync(out, build(p));

  v.warnings.forEach((w) => console.log("  ! " + w));
  if (v.gates.marginMultiple) console.log(`  · margin ${v.gates.marginMultiple}x on landed cost`);
  console.log("✓ " + out + "  (" + (fs.statSync(out).size / 1024).toFixed(1) + "KB)");
}
