import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

// Crop each bike photo to a 9:16 poster, optimize, base64-embed.
async function poster(file, w = 720, q = 78) {
  const buf = await sharp(file)
    .resize({ width: w, height: Math.round((w * 16) / 9), fit: 'cover', position: 'centre' })
    .modulate({ saturation: 1.08 })
    .jpeg({ quality: q, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

const BIKES = [
  { n: '01', brand: 'ARCTIC LEOPARD', model: 'XE Pro Lineup', spec: '26.5 kW · 72 mph', file: 'public/brands/01.jpg', ready: true },
  { n: '02', brand: 'ALTIS', model: 'Sigma', spec: '8 kW · 52V 60Ah', file: 'public/brands/02.jpg' },
  { n: '03', brand: '79BIKE', model: 'Falcon', spec: 'City · 10 kW', file: 'public/brands/03.jpg' },
  { n: '04', brand: 'VENTUS', model: 'One Plus', spec: '12 kW · all-terrain', file: 'public/brands/04.jpg' },
  { n: '05', brand: 'YOZMA', model: 'IN 10 Pro', spec: '10 kW · 72V', file: 'public/brands/05.jpg' },
  { n: '06', brand: 'eRIDE', model: 'Pro SS', spec: '8 kW · street sport', file: 'public/brands/06.jpg' },
  { n: '07', brand: 'SUR-RON', model: 'Ultra Bee', spec: 'Street & trail', file: 'public/brands/07.jpg', ready: true },
  { n: '08', brand: 'Y-VOLT', model: 'Y-Volt Max', spec: '5 kW · commuter', file: 'public/brands/08.jpg' },
];

const HOOKS = [
  { hook: "IT'S HERE.", sub: 'The new Sur-Ron just dropped', len: '15s' },
  { hook: '$49 DOWN.', sub: 'No credit check · ride home today', len: '15s' },
  { hook: 'RUN WITH THE PACK.', sub: 'Alpha Electric Bikes', len: '15s' },
  { hook: 'WE SELL IT. WE FIX IT.', sub: 'Expert service + repair', len: '15s' },
];

console.log('Cropping + embedding bike photos...');
for (const b of BIKES) {
  b.img = await poster(b.file);
  process.stdout.write('  ' + b.brand + ' ✓\n');
}
// hero uses the Sur-Ron shot wide
const heroImg = await sharp('public/brands/07.jpg')
  .resize({ width: 1600, height: 900, fit: 'cover', position: 'centre' })
  .modulate({ saturation: 1.1, brightness: 0.92 })
  .jpeg({ quality: 80, mozjpeg: true })
  .toBuffer();
const hero = `data:image/jpeg;base64,${heroImg.toString('base64')}`;

const marquee = BIKES.map((b) => b.brand).join('  ●  ');

const bikeCards = BIKES.map((b, i) => `
      <a class="drop" style="--i:${i}" href="#">
        <div class="drop-img"><img src="${b.img}" alt="${b.brand} ${b.model}" loading="lazy"></div>
        <div class="drop-scrim"></div>
        <div class="drop-num">${b.n}</div>
        ${b.ready ? '<div class="drop-live">● LIVE</div>' : ''}
        <div class="drop-meta">
          <div class="drop-brand">${b.brand}</div>
          <div class="drop-model">${b.model}</div>
          <div class="drop-spec">${b.spec}</div>
        </div>
      </a>`).join('');

const hookCards = HOOKS.map((h, i) => `
      <div class="hook" style="--i:${i}">
        <div class="hook-tag">HOOK / ${String(i + 1).padStart(2, '0')}</div>
        <div class="hook-line">${h.hook}</div>
        <div class="hook-sub">${h.sub}</div>
        <div class="hook-len">${h.len} · 9:16</div>
      </div>`).join('');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Alpha Electric — the drop</title>
<style>
  :root{
    --bg:#0b0b0d; --ink:#f4f2ec; --dim:#8f8b83; --line:#26241f;
    --volt:#c8ff1e; --heat:#ff4d2e; --card:#141310;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{
    background:var(--bg); color:var(--ink);
    font-family:'Helvetica Neue',Arial,sans-serif;
    -webkit-font-smoothing:antialiased;
    overflow-x:hidden;
  }
  .wrap{max-width:1280px;margin:0 auto;padding:0 22px}

  /* ---- HERO ---- */
  .hero{position:relative;min-height:92vh;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden}
  .hero-bg{position:absolute;inset:0;z-index:0}
  .hero-bg img{width:100%;height:100%;object-fit:cover;transform:scale(1.05);animation:drift 18s ease-in-out infinite alternate}
  .hero-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,13,.55) 0%,rgba(11,11,13,.15) 32%,rgba(11,11,13,.85) 82%,var(--bg) 100%)}
  @keyframes drift{from{transform:scale(1.05) translateY(0)}to{transform:scale(1.12) translateY(-14px)}}
  .hero-inner{position:relative;z-index:2;padding:0 22px 60px;max-width:1280px;margin:0 auto;width:100%}
  .eyebrow{font-size:12px;letter-spacing:.42em;color:var(--volt);font-weight:700;margin-bottom:20px;display:flex;align-items:center;gap:12px}
  .eyebrow::before{content:'';width:34px;height:2px;background:var(--volt);display:inline-block}
  .hero h1{
    font-size:clamp(56px,13vw,168px);line-height:.86;font-weight:800;
    letter-spacing:-.04em;text-transform:uppercase;
    text-shadow:0 6px 40px rgba(0,0,0,.5);
  }
  .hero h1 em{font-style:normal;color:var(--volt);-webkit-text-stroke:0}
  .hero-sub{margin-top:26px;font-size:clamp(15px,2vw,19px);max-width:440px;color:#e6e3db;line-height:1.55}
  .hero-stats{margin-top:34px;display:flex;gap:44px;flex-wrap:wrap}
  .hs b{display:block;font-size:30px;font-weight:800;color:var(--ink);letter-spacing:-.02em}
  .hs span{font-size:11px;letter-spacing:.18em;color:var(--dim);text-transform:uppercase}

  /* ---- MARQUEE ---- */
  .ticker{border-top:1px solid var(--line);border-bottom:1px solid var(--line);overflow:hidden;padding:16px 0;background:var(--card)}
  .ticker-track{display:inline-flex;white-space:nowrap;animation:scroll 26s linear infinite;font-weight:800;font-size:20px;letter-spacing:.05em;color:var(--dim);text-transform:uppercase}
  .ticker-track span{padding-right:28px}
  .ticker:hover .ticker-track{animation-play-state:paused}
  @keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}

  /* ---- SECTION HEAD ---- */
  .shead{padding:90px 0 40px}
  .shead .tag{font-size:12px;letter-spacing:.28em;color:var(--heat);font-weight:700;text-transform:uppercase}
  .shead h2{font-size:clamp(34px,6vw,68px);font-weight:800;letter-spacing:-.03em;text-transform:uppercase;line-height:.95;margin-top:14px}
  .shead p{margin-top:18px;color:var(--dim);max-width:520px;font-size:15px;line-height:1.7}

  /* ---- DROP GRID ---- */
  .drops{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding-bottom:40px}
  .drop{position:relative;aspect-ratio:9/16;border-radius:3px;overflow:hidden;text-decoration:none;color:inherit;background:var(--card);
    opacity:0;transform:translateY(28px);animation:rise .7s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:calc(var(--i)*.07s)}
  .drop-img{position:absolute;inset:0}
  .drop-img img{width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.7,.2,1);filter:saturate(1.05) contrast(1.04)}
  .drop:hover .drop-img img{transform:scale(1.08)}
  .drop-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35) 0%,transparent 30%,transparent 48%,rgba(0,0,0,.86) 100%)}
  .drop-num{position:absolute;top:14px;left:14px;font-size:14px;font-weight:800;letter-spacing:.05em;color:var(--ink);opacity:.9;mix-blend-mode:difference}
  .drop-live{position:absolute;top:13px;right:12px;font-size:9px;font-weight:800;letter-spacing:.14em;color:var(--volt);background:rgba(0,0,0,.5);padding:4px 8px;border-radius:20px;backdrop-filter:blur(4px)}
  .drop-meta{position:absolute;left:16px;right:16px;bottom:16px;z-index:2}
  .drop-brand{font-size:19px;font-weight:800;letter-spacing:-.02em;text-transform:uppercase;line-height:1}
  .drop-model{font-size:13px;color:#d8d4cb;margin-top:3px}
  .drop-spec{font-size:11px;color:var(--volt);font-weight:600;letter-spacing:.04em;margin-top:8px;font-variant-numeric:tabular-nums}
  @keyframes rise{to{opacity:1;transform:translateY(0)}}

  /* ---- HOOKS ---- */
  .hooks{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding-bottom:40px}
  .hook{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--heat);border-radius:3px;padding:34px 32px;
    opacity:0;transform:translateY(20px);animation:rise .6s ease forwards;animation-delay:calc(var(--i)*.08s);transition:border-color .3s,transform .3s}
  .hook:hover{border-left-color:var(--volt);transform:translateY(-3px)}
  .hook-tag{font-size:11px;letter-spacing:.22em;color:var(--dim);font-weight:700}
  .hook-line{font-size:clamp(28px,4vw,42px);font-weight:800;letter-spacing:-.03em;text-transform:uppercase;margin-top:14px;line-height:1}
  .hook-sub{font-size:14px;color:#cfcbc2;margin-top:12px}
  .hook-len{font-size:11px;color:var(--volt);letter-spacing:.1em;margin-top:18px;font-weight:600}

  /* ---- FOOT ---- */
  .foot{border-top:1px solid var(--line);margin-top:80px;padding:56px 0 90px}
  .foot h3{font-size:clamp(30px,5vw,54px);font-weight:800;letter-spacing:-.03em;text-transform:uppercase;line-height:.95}
  .foot h3 em{font-style:normal;color:var(--volt)}
  .foot p{color:var(--dim);margin-top:16px;max-width:460px;font-size:15px;line-height:1.7}
  .steps{margin-top:40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:2px;background:var(--line);border:1px solid var(--line)}
  .step{background:var(--bg);padding:26px 24px}
  .step-n{font-size:12px;color:var(--heat);font-weight:800;letter-spacing:.1em}
  .step b{display:block;margin-top:10px;font-size:16px;font-weight:700}
  .step span{display:block;margin-top:6px;font-size:13px;color:var(--dim);line-height:1.6}
  .loc{margin-top:46px;font-size:13px;color:var(--dim);letter-spacing:.06em}
  .loc b{color:var(--ink)}

  @media(max-width:900px){
    .drops{grid-template-columns:repeat(2,1fr)}
    .hooks{grid-template-columns:1fr}
  }
  @media(max-width:520px){
    .drops{grid-template-columns:repeat(2,1fr);gap:10px}
    .hero-stats{gap:26px}
  }
  @media(prefers-reduced-motion:reduce){
    *{animation:none!important;transition:none!important}
    .drop,.hook{opacity:1;transform:none}
  }
</style>
</head>
<body>

  <header class="hero">
    <div class="hero-bg"><img src="${hero}" alt="Electric dirt bike"></div>
    <div class="hero-inner">
      <div class="eyebrow">Alpha Electric · Kissimmee FL · content drop</div>
      <h1>Every brand.<br>One <em>shop.</em></h1>
      <p class="hero-sub">Sixteen vertical reels — every bike on the floor, cut for the feed. Built to stop the scroll and move metal.</p>
      <div class="hero-stats">
        <div class="hs"><b>16</b><span>Reels</span></div>
        <div class="hs"><b>08</b><span>Brands</span></div>
        <div class="hs"><b>9:16</b><span>Vertical</span></div>
        <div class="hs"><b>30fps</b><span>Feed-native</span></div>
      </div>
    </div>
  </header>

  <div class="ticker">
    <div class="ticker-track">
      <span>${marquee}  ●  </span><span>${marquee}  ●  </span>
    </div>
  </div>

  <main class="wrap">
    <div class="shead">
      <div class="tag">The lineup / 01–08</div>
      <h2>The Drop</h2>
      <p>One reel per brand. Hero shot, model name, real specs — hard cuts, no filler. Tap any tile for the full edit.</p>
    </div>
    <section class="drops">${bikeCards}</section>

    <div class="shead">
      <div class="tag">Stop the scroll / 09–12</div>
      <h2>Hook Reels</h2>
      <p>Three-second promises. Financing, fresh stock, service — the lines that turn a swipe into a walk-in.</p>
    </div>
    <section class="hooks">${hookCards}</section>
  </main>

  <footer class="foot">
    <div class="wrap">
      <h3>Push. Render. <em>Post.</em></h3>
      <p>Everything's built. Send it to render and the whole pack lands ready for the feed.</p>
      <div class="steps">
        <div class="step"><div class="step-n">STEP 01</div><b>Render</b><span>Push the branch — all 16 reels build automatically in the background.</span></div>
        <div class="step"><div class="step-n">STEP 02</div><b>Grab the files</b><span>Download the finished MP4s when the run's done.</span></div>
        <div class="step"><div class="step-n">STEP 03</div><b>Post the drop</b><span>Load the demo account, drop 5–8 reels, let the numbers talk.</span></div>
      </div>
      <div class="loc"><b>ALPHA ELECTRIC BIKES</b> — Kissimmee, Florida · financing available · we sell it, we fix it</div>
    </div>
  </footer>

</body>
</html>`;

await writeFile('preview.html', html);
console.log('\\nWrote preview.html (' + (html.length / 1024).toFixed(0) + ' KB, self-contained)');
