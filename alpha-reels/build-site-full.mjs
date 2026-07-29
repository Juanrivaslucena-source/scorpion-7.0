import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

// ---------- image embedding ----------
async function crop(file, w, ratioH, q = 76) {
  const buf = await sharp(file)
    .resize({ width: w, height: Math.round(w * ratioH), fit: 'cover', position: 'centre' })
    .modulate({ saturation: 1.07 })
    .jpeg({ quality: q, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}
const poster = (f) => crop(f, 560, 16 / 9, 74);
const wide = (f) => crop(f, 1180, 9 / 16, 78);

// ---------- data model ----------
const BIKES = [
  {
    id: 'sur-ron-ultra-bee', file: 'public/brands/07.jpg', group: 'street',
    brand: 'SUR-RON', model: 'Ultra Bee', tagline: 'The one bike that does everything',
    price: '5,999', flagship: true,
    specs: { Motor: '12.5 kW peak mid-drive', Battery: '74V 55Ah · 4.0 kWh', 'Top speed': '56 mph', Range: 'up to 87 mi',
      Weight: '187 lb', Suspension: 'DNM USD forks · 8.6" travel', Brakes: '4-piston hydraulic disc', Charge: '3–4 hr', 'Seat height': '34.5"' },
    bestFor: 'Riders who want a single bike for both the street and the trail.',
    pros: ['Biggest aftermarket & parts network of any e-moto', 'True street + trail crossover', 'Proven reliability, strong resale value', 'Instant, controllable low-end torque'],
    cons: ['Premium price point', 'Heavier than the smaller Light Bee', 'Popular colors can have a wait'],
  },
  {
    id: 'arctic-leopard', file: 'public/brands/01.jpg', group: 'trail',
    brand: 'ARCTIC LEOPARD', model: 'XE Pro R', tagline: 'Full-size power, top-end speed',
    price: '6,499',
    specs: { Motor: '26.5 kW peak', Battery: '72V 60Ah', 'Top speed': '72 mph', Range: 'up to 75 mi',
      Weight: '220 lb', Suspension: 'Fully adjustable USD · 9"+ travel', Brakes: 'Dual hydraulic disc', Torque: '700 Nm at wheel', Charge: '4–5 hr' },
    bestFor: 'Experienced riders chasing the highest power and top speed on the floor.',
    pros: ['Class-leading power and 72 mph top end', 'Full-size motorcycle feel', 'Premium adjustable suspension', 'Serious presence and stance'],
    cons: ['Heavy — not a beginner bike', 'More power than most riders need', 'Higher tire and running cost'],
  },
  {
    id: 'ventus-one-plus', file: 'public/brands/04.jpg', group: 'trail',
    brand: 'VENTUS', model: 'One Plus', tagline: 'All-day range, all-terrain',
    price: '4,799',
    specs: { Motor: '12 kW peak', Battery: '60V 100Ah', 'Top speed': '50 mph', Range: 'up to 100 mi',
      Weight: '205 lb', Suspension: 'USD forks · rear mono-shock', Brakes: 'Hydraulic disc', Charge: '5–6 hr' },
    bestFor: 'Long trail days where you never want to think about range.',
    pros: ['Massive 100Ah battery — longest range here', 'Confident all-terrain capability', 'Strong value for the pack size', 'Comfortable for bigger riders'],
    cons: ['Heavier from the large battery', 'Longer charge time', 'Lower top speed than the flagship'],
  },
  {
    id: 'altis-sigma', file: 'public/brands/02.jpg', group: 'trail',
    brand: 'ALTIS', model: 'Sigma', tagline: 'Light, flickable trail sport',
    price: '3,999',
    specs: { Motor: '8 kW peak', Battery: '52V 60Ah', 'Top speed': '45 mph', Range: 'up to 65 mi',
      Weight: '165 lb', Suspension: 'Adjustable USD forks', Brakes: 'Hydraulic disc', Charge: '4–5 hr' },
    bestFor: 'Riders who want a balanced, playful trail bike without overpaying.',
    pros: ['Light and easy to throw around', 'Strong price-to-fun ratio', 'Approachable, linear power', 'Great step-up from a first e-bike'],
    cons: ['Mid-pack top speed', 'Smaller brand support network', 'Fewer factory color options'],
  },
  {
    id: 'eride-pro-ss', file: 'public/brands/06.jpg', group: 'street',
    brand: 'eRIDE', model: 'Pro SS', tagline: 'Nimble street sport',
    price: '3,499',
    specs: { Motor: '8 kW peak', Battery: '48V 60Ah', 'Top speed': '45 mph', Range: 'up to 60 mi',
      Weight: '158 lb', Suspension: 'USD forks', Brakes: 'Hydraulic disc', Charge: '4 hr' },
    bestFor: 'Street-sport riders and newer riders who want easy manners.',
    pros: ['Lightweight and very nimble', 'Easy, predictable street handling', 'One of the best entry prices', 'Low seat height for shorter riders'],
    cons: ['48V system tops out sooner under load', 'Less suspension travel for jumps', 'Smaller battery than trail bikes'],
  },
  {
    id: '79bike-falcon', file: 'public/brands/03.jpg', group: 'commuter',
    brand: '79BIKE', model: 'Falcon', tagline: 'Built for the city',
    price: '2,999',
    specs: { Motor: '10 kW peak', Battery: '60V 40Ah', 'Top speed': '43 mph', Range: 'up to 55 mi',
      Weight: '150 lb', Suspension: 'USD forks', Brakes: 'Hydraulic disc', Charge: '3–4 hr' },
    bestFor: 'Daily city commuting, campus runs, and quick errands.',
    pros: ['Nimble and quick in traffic', 'Light and easy to handle', 'Fast charge turnaround', 'Clean, modern styling'],
    cons: ['Commuter-first geometry, limited big-trail travel', 'Smaller battery pack', 'Not built for aggressive off-road'],
  },
  {
    id: 'yozma-in10-pro', file: 'public/brands/05.jpg', group: 'commuter',
    brand: 'YOZMA', model: 'IN 10 Pro', tagline: 'High-voltage, compact',
    price: '3,299',
    specs: { Motor: '10 kW peak', Battery: '72V 40Ah', 'Top speed': '48 mph', Range: 'up to 50 mi',
      Weight: '145 lb', Suspension: 'USD forks', Brakes: 'Hydraulic disc', Charge: '3–4 hr' },
    bestFor: 'Riders who want a compact bike with a high-voltage punch.',
    pros: ['72V punch in a small package', 'Compact and easy to store or transport', 'Very light', 'Quick off the line'],
    cons: ['Smaller usable range', 'Less storage and comfort for long rides', 'Firmer ride on rough ground'],
  },
  {
    id: 'y-volt-max', file: 'public/brands/08.jpg', group: 'commuter',
    brand: 'Y-VOLT', model: 'Y-Volt Max', tagline: 'The easy first ride',
    price: '2,499',
    specs: { Motor: '5 kW peak', Battery: '48V 32Ah', 'Top speed': '38 mph', Range: 'up to 45 mi',
      Weight: '140 lb', Suspension: 'Coil forks', Brakes: 'Hydraulic disc', Charge: '3 hr' },
    bestFor: 'First-time riders, younger riders, and short daily commutes.',
    pros: ['Most affordable bike on the floor', 'Forgiving and easy to learn on', 'Low maintenance', 'Lightest bike here'],
    cons: ['Lowest power output', 'Entry-level range', 'Not intended for aggressive trail riding'],
  },
];

const GROUPS = {
  trail: {
    name: 'Trail & MX', accent: 'volt',
    tagline: 'Dirt, jumps, and everything off the pavement',
    blurb: 'Long-travel suspension, aggressive tires, and the torque to climb. These are the bikes built to leave the road behind.',
    strongSuits: ['Long-travel suspension soaks up rough terrain', 'High torque for climbs and loose ground', 'Rugged frames and aggressive tire packages', 'Bigger batteries for full days on the trail'],
    tradeoffs: ['Heavier than street and commuter bikes', 'Longer charge times on the big packs', 'More bike than a first-time rider needs'],
  },
  street: {
    name: 'Street & Supermoto', accent: 'heat',
    tagline: 'Pavement manners with real punch',
    blurb: 'Nimble, lighter, and quick to respond. Set up for street riding and supermoto fun without giving up the option to hit a trail.',
    strongSuits: ['Light and flickable through traffic and corners', 'Predictable, easy-to-learn handling', 'Great value entry into e-moto', 'Comfortable seat heights'],
    tradeoffs: ['Less suspension travel for big jumps', 'Smaller batteries than dedicated trail bikes', 'Lower-voltage systems top out sooner'],
  },
  commuter: {
    name: 'Commuter & City', accent: 'blue',
    tagline: 'Get there fast, charge fast, repeat',
    blurb: 'Compact, efficient, and easy to live with. The bikes that turn a commute into the best part of the day and charge back up before you head out again.',
    strongSuits: ['Light and easy to handle in traffic', 'Fast charge turnaround', 'Simple, low-maintenance ownership', 'Approachable pricing'],
    tradeoffs: ['Commuter-first geometry limits hard trail use', 'Smaller battery packs', 'Not built for aggressive off-road'],
  },
};

const COLORS = ['Stealth Black', 'Volt Green', 'Arctic White', 'Heat Orange', 'Storm Grey'];
const ADDONS = ['Off-road tire package', 'Spare / extended battery', 'Local delivery & setup', 'Extended warranty', 'Fast charger'];

// ---------- build images ----------
console.log('Embedding photos...');
const IMG = {};
for (const b of BIKES) {
  IMG[b.id] = { poster: await poster(b.file), wide: await wide(b.file) };
  process.stdout.write('  ' + b.brand + ' ✓\n');
}
const heroImg = await sharp('public/brands/07.jpg')
  .resize({ width: 1700, height: 960, fit: 'cover', position: 'centre' })
  .modulate({ saturation: 1.1, brightness: 0.9 })
  .jpeg({ quality: 80, mozjpeg: true }).toBuffer();
const HERO = `data:image/jpeg;base64,${heroImg.toString('base64')}`;

// strip data-model to what the client needs (no file paths)
const clientBikes = BIKES.map(({ file, ...rest }) => rest);

const DATA = JSON.stringify({ bikes: clientBikes, groups: GROUPS, colors: COLORS, addons: ADDONS, img: IMG, hero: HERO });

// ---------- HTML shell ----------
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Alpha Electric Bikes — Kissimmee, FL</title>
<style>
  :root{
    --bg:#0b0b0d; --panel:#141310; --ink:#f4f2ec; --dim:#8f8b83; --line:#26241f;
    --volt:#c8ff1e; --heat:#ff4d2e; --blue:#39b6ff; --card:#141310; --ink-soft:#d8d4cb;
    --shadow:0 24px 60px rgba(0,0,0,.5);
  }
  @media(prefers-color-scheme:light){
    :root{--bg:#f5f3ee;--panel:#fffdf8;--ink:#16150f;--dim:#6b6659;--line:#e3ddd0;--card:#fffdf8;--ink-soft:#3c382e;--shadow:0 18px 44px rgba(60,50,20,.12);--heat:#e2331a;--blue:#0f84cc}
  }
  :root[data-theme="dark"]{--bg:#0b0b0d;--panel:#141310;--ink:#f4f2ec;--dim:#8f8b83;--line:#26241f;--card:#141310;--ink-soft:#d8d4cb;--shadow:0 24px 60px rgba(0,0,0,.5);--heat:#ff4d2e;--blue:#39b6ff}
  :root[data-theme="light"]{--bg:#f5f3ee;--panel:#fffdf8;--ink:#16150f;--dim:#6b6659;--line:#e3ddd0;--card:#fffdf8;--ink-soft:#3c382e;--shadow:0 18px 44px rgba(60,50,20,.12);--heat:#e2331a;--blue:#0f84cc}

  *{margin:0;padding:0;box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{background:var(--bg);color:var(--ink);font-family:'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5;overflow-x:hidden}
  a{color:inherit;text-decoration:none}
  img{display:block;max-width:100%}
  .wrap{max-width:1240px;margin:0 auto;padding:0 22px}
  .mono{font-family:ui-monospace,'SF Mono',Menlo,monospace}
  .tnum{font-variant-numeric:tabular-nums}
  button{font-family:inherit;cursor:pointer}

  /* NAV */
  nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
  .nav-in{max-width:1240px;margin:0 auto;padding:14px 22px;display:flex;align-items:center;gap:28px}
  .logo{font-weight:800;letter-spacing:-.02em;font-size:19px;text-transform:uppercase;display:flex;align-items:center;gap:7px}
  .logo b{color:var(--volt)}
  .nav-links{display:flex;gap:24px;margin-left:auto;align-items:center}
  .nav-links a{font-size:13px;font-weight:600;letter-spacing:.02em;color:var(--dim);transition:color .2s;text-transform:uppercase}
  .nav-links a:hover,.nav-links a.active{color:var(--ink)}
  .btn{display:inline-block;padding:11px 20px;background:var(--volt);color:#0b0b0d;font-weight:800;font-size:12px;letter-spacing:.06em;text-transform:uppercase;border-radius:3px;border:none;transition:transform .2s,box-shadow .2s}
  .btn:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(200,255,30,.3)}
  .btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
  .btn.ghost:hover{border-color:var(--ink);box-shadow:none}
  .btn.heat{background:var(--heat);color:#fff}
  .btn.heat:hover{box-shadow:0 8px 22px rgba(255,77,46,.3)}
  .navtoggle{display:none;margin-left:auto;background:none;border:1px solid var(--line);color:var(--ink);border-radius:3px;padding:8px 12px;font-size:16px}

  /* HERO */
  .hero{position:relative;min-height:86vh;display:flex;align-items:flex-end;overflow:hidden}
  .hero-bg{position:absolute;inset:0}
  .hero-bg img{width:100%;height:100%;object-fit:cover;transform:scale(1.05);animation:drift 20s ease-in-out infinite alternate}
  .hero-bg::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,11,13,.5),rgba(11,11,13,.1) 34%,rgba(11,11,13,.82) 80%,var(--bg))}
  @media(prefers-color-scheme:light){.hero-bg::after{background:linear-gradient(180deg,rgba(20,15,5,.42),rgba(20,15,5,.05) 34%,rgba(245,243,238,.7) 84%,var(--bg))}}
  @keyframes drift{from{transform:scale(1.05) translateY(0)}to{transform:scale(1.12) translateY(-16px)}}
  .hero-in{position:relative;z-index:2;padding-bottom:64px;color:#fff}
  @media(prefers-color-scheme:light){.hero-in{color:#fff}}
  .eyebrow{font-size:12px;letter-spacing:.4em;color:var(--volt);font-weight:800;margin-bottom:20px;display:flex;align-items:center;gap:12px}
  .eyebrow::before{content:'';width:34px;height:2px;background:var(--volt)}
  h1.big{font-size:clamp(50px,11vw,140px);line-height:.86;font-weight:800;letter-spacing:-.04em;text-transform:uppercase;text-shadow:0 6px 40px rgba(0,0,0,.45)}
  h1.big em{font-style:normal;color:var(--volt)}
  .hero-sub{margin-top:24px;font-size:clamp(15px,2vw,19px);max-width:460px;line-height:1.55;color:#ececec}
  .hero-cta{margin-top:32px;display:flex;gap:14px;flex-wrap:wrap}

  /* TICKER */
  .ticker{border-top:1px solid var(--line);border-bottom:1px solid var(--line);overflow:hidden;padding:14px 0;background:var(--panel)}
  .ticker-track{display:inline-flex;white-space:nowrap;animation:scroll 28s linear infinite;font-weight:800;font-size:18px;letter-spacing:.05em;color:var(--dim);text-transform:uppercase}
  .ticker-track span{padding-right:26px}
  .ticker:hover .ticker-track{animation-play-state:paused}
  @keyframes scroll{to{transform:translateX(-50%)}}

  /* SECTION HEADS */
  .shead{padding:82px 0 34px}
  .shead .tag{font-size:12px;letter-spacing:.26em;font-weight:800;text-transform:uppercase;color:var(--heat)}
  .shead h2{font-size:clamp(32px,5.5vw,62px);font-weight:800;letter-spacing:-.03em;text-transform:uppercase;line-height:.95;margin-top:12px}
  .shead p{margin-top:16px;color:var(--dim);max-width:560px;font-size:15px;line-height:1.7}

  /* GROUP CARDS (home) */
  .gcards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding-bottom:20px}
  .gcard{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:32px 28px;overflow:hidden;transition:transform .3s,border-color .3s}
  .gcard:hover{transform:translateY(-5px)}
  .gcard.volt:hover{border-color:var(--volt)} .gcard.heat:hover{border-color:var(--heat)} .gcard.blue:hover{border-color:var(--blue)}
  .gcard .bar{position:absolute;top:0;left:0;width:100%;height:3px}
  .gcard.volt .bar{background:var(--volt)} .gcard.heat .bar{background:var(--heat)} .gcard.blue .bar{background:var(--blue)}
  .gcard .gc-count{font-size:12px;letter-spacing:.14em;color:var(--dim);text-transform:uppercase;font-weight:700}
  .gcard h3{font-size:30px;font-weight:800;letter-spacing:-.02em;text-transform:uppercase;margin-top:10px;line-height:1}
  .gcard .gc-tag{color:var(--ink-soft);margin-top:10px;font-size:14px;line-height:1.5}
  .gcard .gc-go{margin-top:22px;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;display:inline-flex;align-items:center;gap:7px}
  .gcard.volt .gc-go{color:var(--volt)} .gcard.heat .gc-go{color:var(--heat)} .gcard.blue .gc-go{color:var(--blue)}

  /* DROP GRID */
  .drops{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding-bottom:30px}
  .drop{position:relative;aspect-ratio:9/16;border-radius:3px;overflow:hidden;background:var(--panel);display:block;
    opacity:0;transform:translateY(26px);animation:rise .6s cubic-bezier(.2,.7,.2,1) forwards;animation-delay:calc(var(--i)*.06s)}
  .drop img{width:100%;height:100%;object-fit:cover;transition:transform .7s cubic-bezier(.2,.7,.2,1)}
  .drop:hover img{transform:scale(1.08)}
  .drop .scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.3),transparent 32%,transparent 46%,rgba(0,0,0,.88))}
  .drop .num{position:absolute;top:12px;left:13px;font-size:13px;font-weight:800;color:#fff;mix-blend-mode:difference}
  .drop .flag{position:absolute;top:11px;right:11px;font-size:9px;font-weight:800;letter-spacing:.12em;color:#0b0b0d;background:var(--volt);padding:4px 8px;border-radius:20px}
  .drop .meta{position:absolute;left:15px;right:15px;bottom:15px;color:#fff}
  .drop .meta .b{font-size:18px;font-weight:800;letter-spacing:-.02em;text-transform:uppercase;line-height:1}
  .drop .meta .m{font-size:12px;color:#d8d4cb;margin-top:3px}
  .drop .meta .p{font-size:12px;color:var(--volt);font-weight:700;margin-top:8px}
  @keyframes rise{to{opacity:1;transform:translateY(0)}}

  /* BIKE DETAIL */
  .bhero{position:relative;height:60vh;min-height:420px;overflow:hidden;border-radius:4px;margin-top:8px}
  .bhero img{width:100%;height:100%;object-fit:cover}
  .bhero .scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),transparent 40%,rgba(0,0,0,.8));display:flex;align-items:flex-end}
  .bhero .cap{padding:34px;color:#fff}
  .bhero .cap .br{font-size:13px;letter-spacing:.2em;color:var(--volt);font-weight:800;text-transform:uppercase}
  .bhero .cap h1{font-size:clamp(40px,7vw,84px);font-weight:800;letter-spacing:-.03em;text-transform:uppercase;line-height:.9;margin-top:8px}
  .bhero .cap .tl{font-size:16px;color:#e6e3db;margin-top:10px}
  .bnav{display:flex;gap:18px;align-items:center;padding:22px 0;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--dim);font-weight:700}
  .bnav a:hover{color:var(--ink)}
  .bgrid{display:grid;grid-template-columns:1.3fr 1fr;gap:40px;padding:30px 0 60px;align-items:start}
  @media(max-width:860px){.bgrid{grid-template-columns:1fr}}
  .specbox{background:var(--panel);border:1px solid var(--line);border-radius:4px;overflow:hidden}
  .specbox h4{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);padding:18px 22px;border-bottom:1px solid var(--line);font-weight:800}
  .specrow{display:flex;justify-content:space-between;padding:13px 22px;border-bottom:1px solid var(--line);font-size:14px}
  .specrow:last-child{border-bottom:none}
  .specrow .k{color:var(--dim)}
  .specrow .v{font-weight:700;text-align:right}
  .pc{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}
  @media(max-width:520px){.pc{grid-template-columns:1fr}}
  .pcbox{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:20px}
  .pcbox h5{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;margin-bottom:14px}
  .pcbox.pro h5{color:var(--volt)} .pcbox.con h5{color:var(--heat)}
  .pcbox ul{list-style:none;display:flex;flex-direction:column;gap:11px}
  .pcbox li{font-size:14px;line-height:1.45;color:var(--ink-soft);padding-left:22px;position:relative}
  .pcbox.pro li::before{content:'+';position:absolute;left:0;color:var(--volt);font-weight:800}
  .pcbox.con li::before{content:'–';position:absolute;left:0;color:var(--heat);font-weight:800}
  .side{position:sticky;top:88px;display:flex;flex-direction:column;gap:16px}
  .pricecard{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:26px}
  .pricecard .lab{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:700}
  .pricecard .pr{font-size:44px;font-weight:800;letter-spacing:-.02em;margin-top:4px}
  .pricecard .pr small{font-size:18px;color:var(--dim);font-weight:600}
  .pricecard .fin{font-size:13px;color:var(--volt);margin-top:6px;font-weight:600}
  .pricecard .best{font-size:13px;color:var(--ink-soft);margin-top:16px;line-height:1.5;border-top:1px solid var(--line);padding-top:16px}
  .pricecard .acts{display:flex;flex-direction:column;gap:10px;margin-top:18px}
  .pricecard .acts .btn{text-align:center}

  /* GROUP PAGE */
  .gphero{padding:60px 0 30px}
  .gphero .tag{font-size:12px;letter-spacing:.26em;text-transform:uppercase;font-weight:800}
  .gphero.volt .tag{color:var(--volt)} .gphero.heat .tag{color:var(--heat)} .gphero.blue .tag{color:var(--blue)}
  .gphero h1{font-size:clamp(40px,8vw,96px);font-weight:800;letter-spacing:-.03em;text-transform:uppercase;line-height:.9;margin-top:12px}
  .gphero p{margin-top:18px;color:var(--dim);max-width:620px;font-size:16px;line-height:1.7}
  .sctwo{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px 0 10px}
  @media(max-width:640px){.sctwo{grid-template-columns:1fr}}

  /* QUOTE */
  .qwrap{display:grid;grid-template-columns:1.2fr .9fr;gap:34px;padding:30px 0 70px;align-items:start}
  @media(max-width:860px){.qwrap{grid-template-columns:1fr}}
  .form{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:30px}
  .field{margin-bottom:20px}
  .field label{display:block;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);font-weight:700;margin-bottom:8px}
  .field input,.field select,.field textarea{width:100%;background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:12px 14px;color:var(--ink);font-family:inherit;font-size:15px}
  .field input:focus,.field select:focus,.field textarea:focus{outline:2px solid var(--volt);outline-offset:1px;border-color:transparent}
  .field textarea{resize:vertical;min-height:90px}
  .row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  @media(max-width:520px){.row2{grid-template-columns:1fr}}
  .chips{display:flex;flex-wrap:wrap;gap:9px}
  .chip{position:relative}
  .chip input{position:absolute;opacity:0;width:0;height:0}
  .chip span{display:inline-block;padding:9px 14px;border:1px solid var(--line);border-radius:20px;font-size:13px;color:var(--ink-soft);transition:all .2s;user-select:none}
  .chip input:checked+span{background:var(--volt);color:#0b0b0d;border-color:var(--volt);font-weight:700}
  .chip input:focus-visible+span{outline:2px solid var(--ink);outline-offset:2px}
  .summary{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:26px;position:sticky;top:88px}
  .summary h4{font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;margin-bottom:16px;color:var(--volt)}
  .sumline{display:flex;justify-content:space-between;gap:12px;font-size:14px;padding:9px 0;border-bottom:1px solid var(--line)}
  .sumline .k{color:var(--dim)} .sumline .v{font-weight:700;text-align:right}
  .sumtotal{font-size:13px;color:var(--ink-soft);line-height:1.6;margin-top:16px}
  .sent{background:color-mix(in srgb,var(--volt) 14%,transparent);border:1px solid var(--volt);border-radius:4px;padding:16px;font-size:14px;margin-top:16px;line-height:1.5;display:none}
  .sent.show{display:block}

  /* FIN / CONTACT */
  .finrow{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px 0}
  @media(max-width:720px){.finrow{grid-template-columns:1fr}}
  .fincard{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:30px}
  .fincard .n{font-size:40px;font-weight:800;color:var(--volt);letter-spacing:-.02em}
  .fincard h4{font-size:18px;font-weight:800;margin-top:6px;text-transform:uppercase;letter-spacing:-.01em}
  .fincard p{color:var(--dim);font-size:14px;margin-top:10px;line-height:1.6}

  /* FOOTER */
  footer{border-top:1px solid var(--line);margin-top:70px;padding:52px 0 70px}
  .foot-in{display:flex;justify-content:space-between;gap:30px;flex-wrap:wrap}
  .foot-in .fl{max-width:340px}
  .foot-in .fl .logo{font-size:22px;margin-bottom:12px}
  .foot-in p{color:var(--dim);font-size:14px;line-height:1.7}
  .footlinks{display:flex;gap:50px;flex-wrap:wrap}
  .footcol h5{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:800;margin-bottom:14px}
  .footcol a{display:block;font-size:14px;color:var(--ink-soft);margin-bottom:9px}
  .footcol a:hover{color:var(--ink)}
  .disclaimer{margin-top:40px;padding-top:22px;border-top:1px solid var(--line);font-size:12px;color:var(--dim);line-height:1.6}

  .themebtn{background:none;border:1px solid var(--line);color:var(--ink);border-radius:3px;padding:8px 10px;font-size:14px}
  .themebtn:hover{border-color:var(--ink)}

  @media(max-width:860px){
    .nav-links{display:none} .navtoggle{display:block}
    .nav-links.open{display:flex;position:absolute;top:100%;left:0;right:0;flex-direction:column;background:var(--bg);border-bottom:1px solid var(--line);padding:18px 22px;gap:16px}
    .drops{grid-template-columns:repeat(2,1fr)} .gcards{grid-template-columns:1fr}
  }
  @media(max-width:520px){.drops{grid-template-columns:repeat(2,1fr);gap:10px}}
  @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}.drop{opacity:1;transform:none}}
</style>
</head>
<body>
  <nav>
    <div class="nav-in">
      <a href="#/" class="logo">ALPHA <b>⚡</b> ELECTRIC</a>
      <button class="navtoggle" onclick="document.getElementById('navlinks').classList.toggle('open')" aria-label="Menu">☰</button>
      <div class="nav-links" id="navlinks">
        <a href="#/lineup" data-r="lineup">Lineup</a>
        <a href="#/group/trail" data-r="group">Trail &amp; MX</a>
        <a href="#/group/street" data-r="group">Street</a>
        <a href="#/group/commuter" data-r="group">Commuter</a>
        <a href="#/financing" data-r="financing">Financing</a>
        <a href="#/contact" data-r="contact">Visit</a>
        <button class="themebtn" onclick="toggleTheme()" aria-label="Toggle theme" title="Toggle light/dark">◐</button>
        <a href="#/quote" class="btn heat">Get a Quote</a>
      </div>
    </div>
  </nav>

  <div id="app"></div>

  <footer>
    <div class="wrap">
      <div class="foot-in">
        <div class="fl">
          <div class="logo">ALPHA <b>⚡</b> ELECTRIC</div>
          <p>Kissimmee's electric dirt-bike shop. Every major brand under one roof — we sell it, we finance it, and we fix it.</p>
        </div>
        <div class="footlinks">
          <div class="footcol">
            <h5>Ride</h5>
            <a href="#/group/trail">Trail &amp; MX</a>
            <a href="#/group/street">Street &amp; Supermoto</a>
            <a href="#/group/commuter">Commuter &amp; City</a>
            <a href="#/lineup">Full Lineup</a>
          </div>
          <div class="footcol">
            <h5>Buy</h5>
            <a href="#/quote">Get a Quote</a>
            <a href="#/financing">Financing</a>
            <a href="#/contact">Visit the Shop</a>
          </div>
        </div>
      </div>
      <div class="disclaimer">
        Specifications shown are representative and provided to help you compare — confirm exact figures, availability, and pricing at the shop. Pricing excludes tax, title, and setup. Financing subject to approval; terms vary. © <span id="yr"></span> Alpha Electric Bikes · Kissimmee, FL.
      </div>
    </div>
  </footer>

<script>
const DATA = ${DATA};
const {bikes, groups, colors, addons, img, hero} = DATA;
const SHOP_EMAIL = 'sales@alphaelectricbikes.com';
const byId = id => bikes.find(b=>b.id===id);
const groupBikes = g => bikes.filter(b=>b.group===g);
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
document.getElementById('yr').textContent=new Date().getFullYear();

/* ---------- views ---------- */
function vHome(){
  const drops = bikes.map((b,i)=>dropCard(b,i)).join('');
  const marquee = bikes.map(b=>b.brand).join('  ●  ');
  const gc = Object.entries(groups).map(([id,g])=>\`
    <a href="#/group/\${id}" class="gcard \${g.accent}">
      <div class="bar"></div>
      <div class="gc-count">\${groupBikes(id).length} bikes</div>
      <h3>\${g.name}</h3>
      <div class="gc-tag">\${g.tagline}</div>
      <div class="gc-go">Explore →</div>
    </a>\`).join('');
  return \`
  <header class="hero">
    <div class="hero-bg"><img src="\${hero}" alt="Electric dirt bike"></div>
    <div class="hero-in wrap">
      <div class="eyebrow">Kissimmee, FL · every brand, one shop</div>
      <h1 class="big">Go <em>electric.</em><br>Go anywhere.</h1>
      <p class="hero-sub">Eight brands of electric dirt bikes on the floor — trail, street, and city. Ride home today with financing from $49 down.</p>
      <div class="hero-cta">
        <a href="#/lineup" class="btn">Browse the lineup</a>
        <a href="#/quote" class="btn ghost">Build a quote</a>
      </div>
    </div>
  </header>
  <div class="ticker"><div class="ticker-track"><span>\${marquee}  ●  </span><span>\${marquee}  ●  </span></div></div>
  <main class="wrap">
    <div class="shead"><div class="tag">Find your ride</div><h2>Three ways to ride</h2><p>Tell us where you ride and we'll point you at the right bikes — each group has its own strong suits and trade-offs.</p></div>
    <section class="gcards">\${gc}</section>
    <div class="shead"><div class="tag">The lineup / 01–08</div><h2>Every bike</h2><p>Tap any bike for full specs, honest pros and cons, and a quote.</p></div>
    <section class="drops">\${drops}</section>
  </main>\`;
}

function dropCard(b,i){
  const n = String(bikes.indexOf(b)+1).padStart(2,'0');
  return \`<a href="#/bike/\${b.id}" class="drop" style="--i:\${i%8}">
    <img src="\${img[b.id].poster}" alt="\${esc(b.brand)} \${esc(b.model)}" loading="lazy">
    <div class="scrim"></div><div class="num">\${n}</div>
    \${b.flagship?'<div class="flag">FLAGSHIP</div>':''}
    <div class="meta"><div class="b">\${esc(b.brand)}</div><div class="m">\${esc(b.model)}</div><div class="p">from $\${b.price}</div></div>
  </a>\`;
}

function vLineup(){
  const drops = bikes.map((b,i)=>dropCard(b,i)).join('');
  return \`<main class="wrap">
    <div class="shead"><div class="tag">Everything on the floor</div><h2>The Full Lineup</h2><p>Eight bikes across three riding styles. Prices are starting MSRP — ask about current color and financing deals.</p></div>
    <section class="drops">\${drops}</section>
  </main>\`;
}

function vGroup(id){
  const g = groups[id]; if(!g) return vHome();
  const list = groupBikes(id);
  const drops = list.map((b,i)=>dropCard(b,i)).join('');
  const strong = g.strongSuits.map(s=>\`<li>\${esc(s)}</li>\`).join('');
  const trade = g.tradeoffs.map(s=>\`<li>\${esc(s)}</li>\`).join('');
  return \`<main class="wrap">
    <div class="gphero \${g.accent}">
      <div class="tag">\${list.length} bikes · \${esc(g.tagline)}</div>
      <h1>\${esc(g.name)}</h1>
      <p>\${esc(g.blurb)}</p>
    </div>
    <section class="sctwo">
      <div class="pcbox pro"><h5>Strong suits</h5><ul>\${strong}</ul></div>
      <div class="pcbox con"><h5>Trade-offs</h5><ul>\${trade}</ul></div>
    </section>
    <div class="shead"><div class="tag">In this group</div><h2>\${esc(g.name)} bikes</h2></div>
    <section class="drops">\${drops}</section>
  </main>\`;
}

function vBike(id){
  const b = byId(id); if(!b) return vHome();
  const g = groups[b.group];
  const specs = Object.entries(b.specs).map(([k,v])=>\`<div class="specrow"><span class="k">\${esc(k)}</span><span class="v tnum">\${esc(v)}</span></div>\`).join('');
  const pros = b.pros.map(p=>\`<li>\${esc(p)}</li>\`).join('');
  const cons = b.cons.map(c=>\`<li>\${esc(c)}</li>\`).join('');
  const idx = bikes.indexOf(b);
  const prev = bikes[(idx-1+bikes.length)%bikes.length];
  const next = bikes[(idx+1)%bikes.length];
  return \`<main class="wrap">
    <div class="bnav">
      <a href="#/lineup">← Lineup</a>
      <a href="#/group/\${b.group}">\${esc(g.name)}</a>
      <span style="margin-left:auto"></span>
      <a href="#/bike/\${prev.id}">← \${esc(prev.brand)}</a>
      <a href="#/bike/\${next.id}">\${esc(next.brand)} →</a>
    </div>
    <div class="bhero">
      <img src="\${img[b.id].wide}" alt="\${esc(b.brand)} \${esc(b.model)}">
      <div class="scrim"><div class="cap">
        <div class="br">\${esc(b.brand)}\${b.flagship?' · flagship':''}</div>
        <h1>\${esc(b.model)}</h1>
        <div class="tl">\${esc(b.tagline)}</div>
      </div></div>
    </div>
    <div class="bgrid">
      <div>
        <div class="specbox"><h4>Full specifications</h4>\${specs}</div>
        <div class="pc">
          <div class="pcbox pro"><h5>Strong suits</h5><ul>\${pros}</ul></div>
          <div class="pcbox con"><h5>Watch-outs</h5><ul>\${cons}</ul></div>
        </div>
      </div>
      <div class="side">
        <div class="pricecard">
          <div class="lab">Starting at</div>
          <div class="pr">$\${b.price}<small></small></div>
          <div class="fin">or from $49 down · no credit check</div>
          <div class="best"><strong>Best for:</strong> \${esc(b.bestFor)}</div>
          <div class="acts">
            <a href="#/quote?bike=\${b.id}" class="btn heat">Get a quote on this bike</a>
            <a href="#/contact" class="btn ghost">Book a test ride</a>
          </div>
        </div>
      </div>
    </div>
  </main>\`;
}

function vQuote(pre){
  const opts = bikes.map(b=>\`<option value="\${b.id}" \${b.id===pre?'selected':''}>\${esc(b.brand)} \${esc(b.model)} — from $\${b.price}</option>\`).join('');
  const colorChips = colors.map((c,i)=>\`<label class="chip"><input type="radio" name="color" value="\${esc(c)}" \${i===0?'checked':''}><span>\${esc(c)}</span></label>\`).join('');
  const addonChips = addons.map(a=>\`<label class="chip"><input type="checkbox" name="addon" value="\${esc(a)}"><span>\${esc(a)}</span></label>\`).join('');
  return \`<main class="wrap">
    <div class="shead"><div class="tag">Customize &amp; request</div><h2>Build Your Quote</h2><p>Pick your bike, colorway, and add-ons. We'll email you a personalized out-the-door price — usually same day.</p></div>
    <div class="qwrap">
      <form class="form" id="quoteForm" onsubmit="return false">
        <div class="field"><label>Which bike?</label><select id="q_bike" onchange="updateSummary()">\${opts}</select></div>
        <div class="field"><label>Colorway</label><div class="chips" onchange="updateSummary()">\${colorChips}</div></div>
        <div class="field"><label>Add-ons</label><div class="chips" onchange="updateSummary()">\${addonChips}</div></div>
        <div class="field"><label>Options</label>
          <div class="chips" onchange="updateSummary()">
            <label class="chip"><input type="checkbox" id="q_fin" checked><span>Interested in financing ($49 down)</span></label>
            <label class="chip"><input type="checkbox" id="q_trade"><span>I have a trade-in</span></label>
          </div>
        </div>
        <div class="row2">
          <div class="field"><label>Your name</label><input id="q_name" oninput="updateSummary()" placeholder="First & last"></div>
          <div class="field"><label>Phone</label><input id="q_phone" type="tel" placeholder="(407) 000-0000"></div>
        </div>
        <div class="field"><label>Email</label><input id="q_email" type="email" oninput="updateSummary()" placeholder="you@email.com"></div>
        <div class="field"><label>Anything else?</label><textarea id="q_msg" placeholder="Trade-in details, timing, questions..."></textarea></div>
        <button class="btn heat" style="width:100%;padding:15px" onclick="submitQuote()">Email me my quote →</button>
        <div class="sent" id="q_sent"></div>
      </form>
      <aside class="summary">
        <h4>Your build</h4>
        <div id="sumBody"></div>
        <div class="sumtotal">Submitting opens your email app with everything filled in and sent to <strong>\${SHOP_EMAIL}</strong>. No obligation — we'll reply with an out-the-door price.</div>
      </aside>
    </div>
  </main>\`;
}

function vFinancing(){
  return \`<main class="wrap">
    <div class="shead"><div class="tag">Ride home today</div><h2>Financing</h2><p>Getting on a bike shouldn't take a perfect credit score. We keep it simple.</p></div>
    <section class="finrow">
      <div class="fincard"><div class="n">$49</div><h4>Down to ride</h4><p>Low down payment gets you rolling. Pick your bike, sign, and ride out the same day.</p></div>
      <div class="fincard"><div class="n">0</div><h4>Credit check options</h4><p>No-credit-check and snap financing available. Approval in minutes, not days.</p></div>
      <div class="fincard"><div class="n">12–48</div><h4>Month terms</h4><p>Flexible terms to fit your budget. Pay it off early any time with no penalty.</p></div>
    </section>
    <div class="shead"><div class="tag">How it works</div><h2>Three steps</h2></div>
    <section class="sctwo">
      <div class="pcbox pro"><h5>What you bring</h5><ul><li>Valid ID</li><li>Proof of income or a recent pay stub</li><li>A $49+ down payment</li><li>That's it — no perfect credit required</li></ul></div>
      <div class="pcbox con"><h5>Good to know</h5><ul><li>All financing is subject to approval</li><li>Terms and rates vary by lender and bike</li><li>Trade-ins can lower your monthly payment</li></ul></div>
    </section>
    <div style="padding:40px 0 10px"><a href="#/quote" class="btn heat">Start a financed quote</a></div>
  </main>\`;
}

function vContact(){
  return \`<main class="wrap">
    <div class="shead"><div class="tag">Come ride</div><h2>Visit the Shop</h2><p>Test-ride anything on the floor. Sales, service, and financing all under one roof in Kissimmee.</p></div>
    <section class="finrow">
      <div class="fincard"><h4>Location</h4><p>Kissimmee, Florida<br>Osceola County<br><em style="color:var(--dim)">Exact address on request</em></p></div>
      <div class="fincard"><h4>Hours</h4><p>Mon–Sat · 10a–7p<br>Sun · 11a–5p<br>Walk-ins welcome</p></div>
      <div class="fincard"><h4>Service</h4><p>We sell it and we fix it — every brand we carry, plus tune-ups, tires, and battery service.</p></div>
    </section>
    <div class="shead"><div class="tag">Reach us</div><h2>Say hello</h2></div>
    <section class="sctwo">
      <div class="pcbox pro"><h5>Sales &amp; quotes</h5><ul><li>Build a quote online — reply usually same day</li><li>Test rides available during shop hours</li><li>Ask about current color and financing deals</li></ul></div>
      <div class="pcbox con"><h5>Service &amp; repair</h5><ul><li>Warranty and out-of-warranty work</li><li>Tires, brakes, and battery diagnostics</li><li>Upgrades and aftermarket installs</li></ul></div>
    </section>
    <div style="padding:40px 0 10px;display:flex;gap:12px;flex-wrap:wrap"><a href="#/quote" class="btn heat">Get a quote</a><a href="#/lineup" class="btn ghost">Browse bikes</a></div>
  </main>\`;
}

/* ---------- quote logic ---------- */
function readQuote(){
  const bike = byId(document.getElementById('q_bike').value) || bikes[0];
  const color = (document.querySelector('input[name=color]:checked')||{}).value||'—';
  const addonEls = [...document.querySelectorAll('input[name=addon]:checked')].map(e=>e.value);
  const fin = document.getElementById('q_fin').checked;
  const trade = document.getElementById('q_trade').checked;
  const name = document.getElementById('q_name').value.trim();
  const email = document.getElementById('q_email').value.trim();
  const phone = document.getElementById('q_phone').value.trim();
  const msg = document.getElementById('q_msg').value.trim();
  return {bike,color,addonEls,fin,trade,name,email,phone,msg};
}
function updateSummary(){
  const q = readQuote();
  const rows = [
    ['Bike', q.bike.brand+' '+q.bike.model],
    ['Starting price', '$'+q.bike.price],
    ['Color', q.color],
    ['Add-ons', q.addonEls.length?q.addonEls.join(', '):'None'],
    ['Financing', q.fin?'Yes — $49 down':'No'],
    ['Trade-in', q.trade?'Yes':'No'],
  ];
  if(q.name) rows.push(['Name', q.name]);
  document.getElementById('sumBody').innerHTML = rows.map(([k,v])=>\`<div class="sumline"><span class="k">\${esc(k)}</span><span class="v">\${esc(v)}</span></div>\`).join('');
}
function submitQuote(){
  const q = readQuote();
  if(!q.email){ alert('Add your email so we can send the quote.'); document.getElementById('q_email').focus(); return; }
  const lines = [
    'QUOTE REQUEST — Alpha Electric Bikes','',
    'Bike: '+q.bike.brand+' '+q.bike.model+' (from $'+q.bike.price+')',
    'Color: '+q.color,
    'Add-ons: '+(q.addonEls.length?q.addonEls.join(', '):'None'),
    'Financing: '+(q.fin?'Yes — interested in $49 down':'No'),
    'Trade-in: '+(q.trade?'Yes':'No'),'',
    'Name: '+(q.name||'—'),
    'Phone: '+(q.phone||'—'),
    'Email: '+q.email,'',
    'Notes: '+(q.msg||'—'),
  ];
  const body = lines.join('\\n');
  const subject = 'Quote request: '+q.bike.brand+' '+q.bike.model;
  const mailto = 'mailto:'+SHOP_EMAIL+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
  const sent = document.getElementById('q_sent');
  sent.classList.add('show');
  sent.innerHTML = 'Opening your email app to send this to <strong>'+SHOP_EMAIL+'</strong>. '+
    'If nothing opens, <a href="'+mailto+'" style="color:var(--volt);font-weight:700">click here</a> or '+
    '<button class="themebtn" style="padding:4px 10px" onclick="copyQuote(this)">copy the details</button>.';
  window.__lastQuote = body+'\\n\\nTo: '+SHOP_EMAIL+'\\nSubject: '+subject;
  location.href = mailto;
}
function copyQuote(btn){
  navigator.clipboard.writeText(window.__lastQuote||'').then(()=>{btn.textContent='Copied ✓';}).catch(()=>{btn.textContent='Copy failed';});
}

/* ---------- router ---------- */
function parseHash(){
  const h = location.hash.replace(/^#/,'')||'/';
  const [path,query] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query||'');
  return {parts,params};
}
function render(){
  const {parts,params} = parseHash();
  const app = document.getElementById('app');
  let html, route='home';
  if(parts.length===0){ html=vHome(); route='home'; }
  else if(parts[0]==='lineup'){ html=vLineup(); route='lineup'; }
  else if(parts[0]==='group'){ html=vGroup(parts[1]); route='group'; }
  else if(parts[0]==='bike'){ html=vBike(parts[1]); route='bike'; }
  else if(parts[0]==='quote'){ html=vQuote(params.get('bike')); route='quote'; }
  else if(parts[0]==='financing'){ html=vFinancing(); route='financing'; }
  else if(parts[0]==='contact'){ html=vContact(); route='contact'; }
  else { html=vHome(); }
  app.innerHTML = html;
  window.scrollTo(0,0);
  document.getElementById('navlinks').classList.remove('open');
  document.querySelectorAll('.nav-links a[data-r]').forEach(a=>a.classList.toggle('active',a.getAttribute('data-r')===route));
  if(route==='quote') updateSummary();
}
window.addEventListener('hashchange',render);

/* ---------- theme ---------- */
function toggleTheme(){
  const r=document.documentElement;
  const cur=r.getAttribute('data-theme')|| (matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
  const nx=cur==='dark'?'light':'dark';
  r.setAttribute('data-theme',nx);
  try{localStorage.setItem('theme',nx)}catch(e){}
}
try{const t=localStorage.getItem('theme'); if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}

render();
</script>
</body>
</html>`;

await writeFile('preview.html', html);
console.log('\nWrote preview.html (' + (html.length / 1024).toFixed(0) + ' KB, self-contained full site)');
