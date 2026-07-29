import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const G = './generated';
const OUT = './site';
await mkdir(OUT, { recursive: true });

// Resize + base64-embed so the page is a single self-contained file.
async function dataUri(file, width, quality = 80) {
  const buf = await sharp(`${G}/${file}`)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

const hero = await dataUri('p1-blossom-street.jpg', 1600, 82);
const garage = await dataUri('01-garage.jpg', 1200, 80);
const golden = await dataUri('p3-golden.jpg', 1000, 80);
const macro = await dataUri('03-macro.jpg', 1000, 80);
const snow = await dataUri('p2-snow.jpg', 1000, 80);
const rider = await dataUri('02-rider.jpg', 1000, 80);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Alpha Electric — concept redesign</title>
<style>
  :root{--bg:#0b0b0d;--panel:#121215;--ink:#f4f4f6;--muted:#9a9aa3;--rose:#ff5c8a;--line:rgba(255,255,255,.09)}
  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  img{display:block;max-width:100%}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:1160px;margin:0 auto;padding:0 24px}
  .spec{background:#161616;color:#8a8a8a;font-size:12px;letter-spacing:.5px;text-align:center;padding:9px;border-bottom:1px solid var(--line)}

  nav{position:sticky;top:0;z-index:40;backdrop-filter:blur(14px);background:rgba(11,11,13,.7);border-bottom:1px solid var(--line)}
  .nb{display:flex;align-items:center;justify-content:space-between;height:66px}
  .wm{font-weight:800;letter-spacing:5px;font-size:17px}
  .wm b{color:var(--rose)}
  .nav-links{display:flex;gap:30px;font-size:13px;letter-spacing:.5px;color:var(--muted);text-transform:uppercase;font-weight:600}
  .nav-links a:hover{color:var(--ink)}
  .btn{display:inline-block;font-weight:700;font-size:13px;letter-spacing:.5px;padding:11px 20px;border-radius:999px}
  .btn-solid{background:var(--ink);color:#0b0b0d}
  .btn-rose{background:var(--rose);color:#fff}
  .btn-ghost{border:1px solid var(--line);color:var(--ink)}
  @media(max-width:760px){.nav-links{display:none}}

  .hero{position:relative;min-height:82vh;display:flex;align-items:flex-end;overflow:hidden}
  .hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .hero .scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,13,.35) 0%,rgba(11,11,13,0) 30%,rgba(11,11,13,.55) 75%,rgba(11,11,13,.95) 100%)}
  .hero .inner{position:relative;padding:0 0 74px}
  .eyebrow{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--rose);font-weight:700;margin-bottom:18px}
  h1{font-size:clamp(40px,7vw,78px);line-height:.98;font-weight:800;letter-spacing:-2px;max-width:12ch}
  .hero p{margin-top:20px;color:#d6d6da;font-size:19px;max-width:52ch}
  .hero .cta{margin-top:32px;display:flex;gap:12px;flex-wrap:wrap}

  .marquee{border-top:1px solid var(--line);border-bottom:1px solid var(--line);overflow:hidden;background:#0e0e10}
  .marquee .row{display:flex;gap:56px;padding:22px 0;white-space:nowrap;justify-content:center;flex-wrap:wrap;color:var(--muted);font-weight:800;letter-spacing:3px;font-size:15px}

  section{padding:96px 0}
  .head .kick{font-size:12px;letter-spacing:3px;text-transform:uppercase;color:var(--rose);font-weight:700;margin-bottom:12px}
  .h2{font-size:clamp(28px,4.5vw,44px);font-weight:800;letter-spacing:-1px}
  .lede{color:var(--muted);max-width:56ch;margin-top:12px;font-size:17px}

  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:46px}
  @media(max-width:820px){.grid{grid-template-columns:1fr 1fr}}
  @media(max-width:520px){.grid{grid-template-columns:1fr}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:18px;overflow:hidden;transition:transform .25s,border-color .25s}
  .card:hover{transform:translateY(-5px);border-color:rgba(255,92,138,.45)}
  .card .im{aspect-ratio:4/5;overflow:hidden}
  .card .im img{width:100%;height:100%;object-fit:cover;transition:transform .5s}
  .card:hover .im img{transform:scale(1.05)}
  .card .b{padding:18px 20px 22px}
  .card h3{font-size:19px;font-weight:800}
  .card .sub{color:var(--muted);font-size:14px;margin-top:3px}
  .card .tag{display:inline-block;margin-top:12px;border:1px solid var(--line);border-radius:999px;padding:5px 12px;font-size:12px;color:var(--muted);font-weight:600}

  .split{display:grid;grid-template-columns:1.05fr 1fr;gap:0;align-items:stretch;border:1px solid var(--line);border-radius:24px;overflow:hidden;margin-top:20px}
  @media(max-width:820px){.split{grid-template-columns:1fr}}
  .split .im img{width:100%;height:100%;object-fit:cover;min-height:340px}
  .split .tx{padding:52px 44px;display:flex;flex-direction:column;justify-content:center;background:var(--panel)}
  .split .tx h3{font-size:30px;font-weight:800;letter-spacing:-.5px}
  .split .tx p{color:var(--muted);margin-top:14px;font-size:16px}

  .locs{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:46px}
  @media(max-width:760px){.locs{grid-template-columns:1fr}}
  .loc{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:30px}
  .loc .badge{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--rose);font-weight:700}
  .loc h3{font-size:24px;font-weight:800;margin:8px 0 16px}
  .loc .row{display:flex;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:15px}
  .loc .row:last-child{border-bottom:0}
  .loc .row b{min-width:76px;color:var(--muted);font-weight:600}

  .svc{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:46px}
  @media(max-width:760px){.svc{grid-template-columns:1fr}}
  .svc .i{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:26px}
  .svc .i .d{width:40px;height:40px;border-radius:10px;background:rgba(255,92,138,.14);display:grid;place-items:center;margin-bottom:14px;font-size:20px}
  .svc .i h4{font-size:18px;font-weight:800}
  .svc .i p{color:var(--muted);font-size:15px;margin-top:6px}

  .fin{border:1px solid var(--line);border-radius:24px;background:linear-gradient(120deg,#17121a,#0e0e10);padding:56px 40px;text-align:center;margin-top:20px}
  .fin h3{font-size:clamp(26px,4vw,40px);font-weight:800;letter-spacing:-.5px}
  .fin p{color:var(--muted);max-width:48ch;margin:14px auto 0}

  footer{border-top:1px solid var(--line);padding:46px 0;color:var(--muted);font-size:14px}
  .foot{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:center}
</style>
</head>
<body>
<div class="spec">CONCEPT REDESIGN — unofficial pitch mockup for Alpha Electric. Not an official website.</div>

<nav><div class="wrap nb">
  <div class="wm">ALPHA<b>·</b>ELECTRIC</div>
  <div class="nav-links"><a href="#bikes">Bikes</a><a href="#locations">Locations</a><a href="#service">Service</a><a href="#contact">Contact</a></div>
  <a href="#contact" class="btn btn-rose">Book a test ride</a>
</div></nav>

<header class="hero">
  <img src="${hero}" alt="Electric supermoto under cherry blossoms">
  <div class="scrim"></div>
  <div class="wrap inner">
    <div class="eyebrow">Orlando · Kissimmee</div>
    <h1>Premium electric bikes.</h1>
    <p>High-performance electric supermotos and dirt bikes — sold, serviced, and financed across two Central Florida locations.</p>
    <div class="cta">
      <a href="#bikes" class="btn btn-solid">Explore the lineup</a>
      <a href="#locations" class="btn btn-ghost">Visit a store</a>
    </div>
  </div>
</header>

<div class="marquee"><div class="wrap row">
  <span>SUR-RON</span><span>TALARIA</span><span>VENTUS</span><span>STRIKE</span><span>SHADOW</span><span>YOZMA</span>
</div></div>

<section id="bikes">
  <div class="wrap">
    <div class="head">
      <div class="kick">The lineup</div>
      <div class="h2">Machines in stock</div>
      <p class="lede">From street-legal supermotos to full-suspension off-road builds. Every bike backed by in-house service.</p>
    </div>
    <div class="grid">
      <div class="card"><div class="im"><img src="${golden}" alt=""></div><div class="b"><h3>Sur-Ron Ultra Bee</h3><div class="sub">Supermoto · street &amp; trail</div><div class="tag">In stock</div></div></div>
      <div class="card"><div class="im"><img src="${garage}" alt=""></div><div class="b"><h3>Talaria Sting</h3><div class="sub">Off-road · full suspension</div><div class="tag">In stock</div></div></div>
      <div class="card"><div class="im"><img src="${snow}" alt=""></div><div class="b"><h3>Ventus supermoto</h3><div class="sub">Street-legal e-moto</div><div class="tag">In stock</div></div></div>
      <div class="card"><div class="im"><img src="${rider}" alt=""></div><div class="b"><h3>Strike / Shadow</h3><div class="sub">Performance electric</div><div class="tag">In stock</div></div></div>
      <div class="card"><div class="im"><img src="${macro}" alt=""></div><div class="b"><h3>Yozma builds</h3><div class="sub">Detailed &amp; dialed</div><div class="tag">In stock</div></div></div>
      <div class="card"><div class="im"><img src="${hero}" alt=""></div><div class="b"><h3>Custom builds</h3><div class="sub">Your bike, your spec</div><div class="tag">Made to order</div></div></div>
    </div>
  </div>
</section>

<section style="padding-top:0"><div class="wrap">
  <div class="split">
    <div class="im"><img src="${garage}" alt=""></div>
    <div class="tx">
      <h3>Street-legal supermotos and off-road machines.</h3>
      <p>We stock the brands riders actually want — Sur-Ron, Talaria, Ventus, Strike, Shadow and Yozma — and set every bike up so it's ready to ride the day you take it home.</p>
    </div>
  </div>
</div></section>

<section id="locations" style="padding-top:0"><div class="wrap">
  <div class="head"><div class="kick">Two locations</div><div class="h2">Come see them in person</div></div>
  <div class="locs">
    <div class="loc">
      <div class="badge">Main showroom</div>
      <h3>Alpha Electric Bikes</h3>
      <div class="row"><b>Address</b><span>2802 N Orange Blossom Trl, Ste B<br>Kissimmee, FL 34744</span></div>
      <div class="row"><b>Phone</b><span>(321) 390-2885</span></div>
      <div class="row"><b>Hours</b><span>Mon–Sat 10–8 · Sun 11–6</span></div>
      <div class="row"><b>Social</b><span>@alphaelectricbikes</span></div>
    </div>
    <div class="loc">
      <div class="badge">Sister location</div>
      <h3>Alpha Volt Electric</h3>
      <div class="row"><b>About</b><span>Electronics store carrying select Alpha Electric e-bike stock.</span></div>
      <div class="row"><b>Address</b><span>Orlando area — [add address]</span></div>
      <div class="row"><b>Social</b><span>@alphavoltelectric</span></div>
    </div>
  </div>
</div></section>

<section id="service" style="padding-top:0"><div class="wrap">
  <div class="head"><div class="kick">Sales &amp; service</div><div class="h2">We sell it. We service it.</div><p class="lede">Expert repair and technical service on every electric bike — not only the ones we sell.</p></div>
  <div class="svc">
    <div class="i"><div class="d">🔧</div><h4>Expert repair</h4><p>Controllers, batteries, brakes, diagnostics — handled by people who ride.</p></div>
    <div class="i"><div class="d">⚡</div><h4>Upgrades &amp; builds</h4><p>Performance tuning, tires, and full custom builds.</p></div>
    <div class="i"><div class="d">🛡️</div><h4>Service &amp; tune-ups</h4><p>Keep your machine dialed with regular maintenance.</p></div>
  </div>
</div></section>

<section style="padding-top:0"><div class="wrap">
  <div class="fin">
    <div class="kick" style="color:var(--rose);font-size:12px;letter-spacing:3px;text-transform:uppercase;font-weight:700">Financing</div>
    <h3>Flexible financing available in-store.</h3>
    <p>Ride now and pay over time. Ask our team about current financing options on your next build.</p>
    <div style="margin-top:26px"><a href="#contact" class="btn btn-rose">Talk to the team</a></div>
  </div>
</div></section>

<footer id="contact"><div class="wrap foot">
  <div class="wm">ALPHA<b>·</b>ELECTRIC</div>
  <div>2802 N Orange Blossom Trl, Kissimmee FL · (321) 390-2885 · @alphaelectricbikes</div>
  <div style="opacity:.6;width:100%;font-size:12px">Concept redesign mockup — created as a pitch, not an official Alpha Electric website.</div>
</div></footer>

</body>
</html>`;

await writeFile(`${OUT}/index.html`, html);
console.log('wrote site/index.html —', (Buffer.byteLength(html) / 1024 / 1024).toFixed(2), 'MB');
