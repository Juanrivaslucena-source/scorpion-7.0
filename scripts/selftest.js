#!/usr/bin/env node
/**
 * scripts/selftest.js
 * Dependency-free smoke tests. Verifies data integrity, schema conformance,
 * routing decisions and each module's core logic.
 *
 *   npm test
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failed++;
    console.log(`  \x1b[31m✕\x1b[0m ${name}\n      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function eq(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${b}, got ${a}`);
}

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

console.log('\nScorpion self-test\n');

/* ---------- file layout --------------------------------------------------- */

console.log('File layout');
[
  'index.html', 'package.json', '.gitignore', 'README.md',
  'assets/css/dashboard.css', 'assets/js/app.js', 'assets/js/auth.js',
  'assets/js/router.js', 'assets/js/dashboard.js', 'assets/js/api.js',
  'modules/product-scout/scout.js', 'modules/product-scout/product-template.json',
  'modules/content-studio/studio.js', 'modules/content-studio/clip-template.json',
  'modules/sales-tracker/tracker.js', 'modules/sales-tracker/sales-schema.json',
  'modules/model-registry/registry.js', 'modules/model-registry/models.json',
  'data/products.json', 'data/content.json', 'data/sales.json',
  'data/seed/products-seed.json', 'data/seed/content-seed.json', 'data/seed/sales-seed.json',
  'scripts/orchestrate.js', 'scripts/arena-router.js', 'scripts/fable-agent.js',
  'pipeline/PIPELINE.md', 'pipeline/COMMAND_CENTER.md', 'auth/callback.html',
].forEach((f) => {
  test(`exists: ${f}`, () => assert(fs.existsSync(path.join(ROOT, f)), `missing ${f}`));
});

/* ---------- data integrity ------------------------------------------------ */

console.log('\nData integrity');

test('products.json parses and has 5 demo products', () => {
  const doc = read('data/products.json');
  eq(doc.products.length, 5);
  eq(doc.count, 5);
});

test('every product has a valid stage', () => {
  const valid = ['researching', 'sourcing', 'active', 'winning', 'dead'];
  read('data/products.json').products.forEach((p) => {
    assert(valid.includes(p.stage), `${p.id} has bad stage "${p.stage}"`);
  });
});

test('every product margin matches cost and price', () => {
  read('data/products.json').products.forEach((p) => {
    const expected = Math.round(((p.salePrice - p.cost) / p.salePrice) * 1000) / 10;
    assert(Math.abs(expected - p.marginPct) < 0.2, `${p.id}: stated ${p.marginPct}%, computed ${expected}%`);
  });
});

test('all products clear the 3x margin rule', () => {
  read('data/products.json').products.forEach((p) => {
    assert(p.salePrice >= p.cost * 3, `${p.id} is under 3x (${p.cost} → ${p.salePrice})`);
  });
});

test('content.json has 3 clips per product', () => {
  const clips = read('data/content.json').clips;
  const products = read('data/products.json').products;
  products.forEach((p) => {
    const n = clips.filter((c) => c.productId === p.id).length;
    eq(n, 3, `${p.id} has ${n} clips, expected 3`);
  });
});

test('every clip references a real product', () => {
  const ids = new Set(read('data/products.json').products.map((p) => p.id));
  read('data/content.json').clips.forEach((c) => {
    assert(ids.has(c.productId), `${c.id} references unknown product ${c.productId}`);
  });
});

test('content totals are consistent', () => {
  const doc = read('data/content.json');
  const views = doc.clips.reduce((s, c) => s + c.metrics.views, 0);
  eq(doc.totals.views, views);
});

test('sales.json covers 30 days', () => {
  eq(read('data/sales.json').daily.length, 30);
});

test('sales revenue is approximately $4,200', () => {
  const t = read('data/sales.json').totals;
  assert(t.revenue > 3800 && t.revenue < 4600, `revenue ${t.revenue} outside expected band`);
});

test('sales totals recompute from the order list', () => {
  const doc = read('data/sales.json');
  const live = doc.orders.filter((o) => o.status !== 'refunded');
  const revenue = Math.round(live.reduce((s, o) => s + o.unitPrice * o.quantity, 0) * 100) / 100;
  assert(Math.abs(revenue - doc.totals.revenue) < 0.02, `computed ${revenue} vs stated ${doc.totals.revenue}`);
  eq(doc.totals.orders, live.length);
});

test('every order references a real product', () => {
  const ids = new Set(read('data/products.json').products.map((p) => p.id));
  read('data/sales.json').orders.forEach((o) => {
    assert(ids.has(o.productId), `${o.id} references unknown product ${o.productId}`);
  });
});

test('sales span both Shopify and TikTok Shop', () => {
  const channels = Object.keys(read('data/sales.json').byChannel);
  assert(channels.includes('shopify'), 'no shopify revenue');
  assert(channels.includes('tiktok-shop'), 'no tiktok-shop revenue');
});

test('tasks.json has exactly 2 running tasks', () => {
  const running = read('data/tasks.json').tasks.filter((t) => t.status === 'running');
  eq(running.length, 2);
});

/* ---------- model registry ------------------------------------------------ */

console.log('\nModel registry');

const registry = require('../modules/model-registry/registry');

test('registry loads and exposes models', () => {
  assert(registry.all().length >= 8, 'expected at least 8 models');
});

test('every task route points at a real model', () => {
  const reg = registry.load();
  const ids = new Set(reg.models.map((m) => m.id));
  Object.entries(reg.taskRoutes).forEach(([task, route]) => {
    ['primary', 'fallback', 'escalate'].forEach((k) => {
      if (route[k]) assert(ids.has(route[k]), `${task}.${k} → unknown model "${route[k]}"`);
    });
  });
});

test('router picks Perplexity for trend research', () => {
  eq(registry.select('trend-research').model.id, 'perplexity-sonar');
});

test('router picks GPT-5 for margin analysis', () => {
  eq(registry.select('margin-analysis').model.id, 'gpt-5-thinking');
});

test('router escalates supplier work to Fable 5', () => {
  eq(registry.select('supplier-verification').model.id, 'fable-5');
});

test('router honours an explicit model override', () => {
  eq(registry.select('hook-generation', { model: 'claude-sonnet' }).model.id, 'claude-sonnet');
});

test('router respects the cost ceiling', () => {
  const choice = registry.select('listing-copy', { costCeilingUsd: 0.001 });
  assert(!choice || choice.estimatedCostUsd <= 0.001, 'returned a model above the ceiling');
});

/* ---------- arena router -------------------------------------------------- */

console.log('\nArena router');

const arena = require('./arena-router');

test('simulated trend research returns items', async () => {
  const out = arena.simulate('trend-research', {});
  assert(Array.isArray(out.items) && out.items.length, 'no items');
});

test('simulated margin analysis computes a real margin', () => {
  const out = arena.simulate('margin-analysis', { cost: 2, salePrice: 20 });
  eq(out.marginPct, 90);
});

test('hook generation honours the requested count', () => {
  eq(arena.simulate('hook-generation', { count: 3 }).hooks.length, 3);
});

/* ---------- fable agent --------------------------------------------------- */

console.log('\nFable agent');

const fable = require('./fable-agent');

test('budget reports remaining spend', () => {
  const b = fable.budget();
  assert(b.limit > 0 && b.remaining <= b.limit, 'nonsensical budget');
});

test('unknown actions are rejected', async () => {
  let threw = false;
  await fable.run('not-a-real-action').catch(() => { threw = true; });
  assert(threw, 'expected a throw');
});

/* ---------- sales tracker ------------------------------------------------- */

console.log('\nSales tracker');

const tracker = require('../modules/sales-tracker/tracker');

test('normalizes a Shopify order', () => {
  const [o] = tracker.normalize('shopify', [{
    id: 9001, created_at: '2026-07-20T10:00:00Z', financial_status: 'paid',
    fulfillment_status: 'fulfilled',
    line_items: [{ sku: 'prd_grout01', quantity: 2, price: '19.95' }],
  }]);
  eq(o.id, 'ord_9001');
  eq(o.quantity, 2);
  eq(o.status, 'delivered');
  eq(o.unitCost, 2.66, 'should backfill cost from the product catalog');
});

test('normalizes a TikTok Shop order', () => {
  const [o] = tracker.normalize('tiktok-shop', [{
    order_id: 'TT77', create_time_iso: '2026-07-21T08:00:00Z',
    sku_id: 'prd_cargel1', quantity: 1, order_status: 'COMPLETED',
    payment: { total_amount: 14.95 },
  }]);
  eq(o.channel, 'tiktok-shop');
  eq(o.status, 'delivered');
});

test('ingest is idempotent in dry-run', () => {
  const before = tracker.readSales().orders.length;
  tracker.ingest('shopify', [{
    id: 9002, created_at: '2026-07-22T10:00:00Z', financial_status: 'paid',
    line_items: [{ sku: 'prd_grout01', quantity: 1, price: '19.95' }],
  }], { dryRun: true });
  eq(tracker.readSales().orders.length, before, 'dry run must not persist');
});

test('window computes a 7-day delta', () => {
  const w = tracker.window(7);
  assert(w.current > 0, 'no revenue in the trailing window');
  assert(typeof w.deltaPct === 'number', 'delta missing');
});

test('byProduct ranks the grout pen first', () => {
  eq(tracker.byProduct()[0].productId, 'prd_grout01');
});

test('project returns a 30-day figure', () => {
  assert(tracker.project().projected30d > 0, 'no projection');
});

/* ---------- content studio ------------------------------------------------ */

console.log('\nContent studio');

const studio = require('../modules/content-studio/studio');

test('buildScript returns three beats', () => {
  const s = studio.buildScript({ name: 'Test', salePrice: 19.95 }, 'hook', 'transformation');
  eq(s.length, 3);
  assert(s[0].t === '0-3s', 'first beat must be the 3-second hook window');
});

test('hashtags map to the product category', () => {
  assert(studio.hashtagsFor({ category: 'auto' }).includes('#cartok'));
});

/* ---------- product scout ------------------------------------------------- */

console.log('\nProduct scout');

const scout = require('../modules/product-scout/scout');

test('scoring rewards high margin, rising trend, low saturation', () => {
  const hot = scout.scoreCandidate({ marginPct: 88, momentum: 'rising', saturation: 'low', hasVisualDemo: true, shipDaysMax: 12 });
  const cold = scout.scoreCandidate({ marginPct: 55, momentum: 'cooling', saturation: 'high', hasVisualDemo: false, shipDaysMax: 25 });
  assert(hot > 85, `hot candidate scored only ${hot}`);
  assert(cold < 30, `cold candidate scored ${cold}`);
});

test('markdown report matches the required format', () => {
  const md = scout.toMarkdown({
    completedAt: '2026-07-29T00:00:00.000Z',
    recommendation: 'Test pick',
    candidates: [{
      name: 'Test Product', cost: 2, salePrice: 20, marginPct: 90,
      supplier: { url: 'https://example.com' },
      trend: { source: 'TikTok', hashtag: '#test' },
      contentAngles: ['a', 'b', 'c'],
      saturation: { score: 'low', evidence: 'few sellers' },
      risks: ['trend decay'],
    }],
  }, 1);
  assert(md.includes('# Product Scout Report #1'), 'missing title');
  assert(md.includes('Generated by: Arena.ai + Fable 5'), 'missing attribution');
  assert(md.includes('## Product 1: Test Product'), 'missing product heading');
  assert(md.includes('## Recommendation'), 'missing recommendation');
});

/* ---------- orchestrator -------------------------------------------------- */

console.log('\nOrchestrator');

const orchestrate = require('./orchestrate');

test('exposes handlers for every core task type', () => {
  ['product-scout', 'content-generation', 'video-generation', 'sales-ingest', 'sales-analysis', 'supplier-verification']
    .forEach((t) => assert(orchestrate.HANDLERS[t], `missing handler: ${t}`));
});

test('readTasks returns the persisted queue', () => {
  assert(orchestrate.readTasks().tasks.length > 0, 'no tasks loaded');
});

/* ---------- frontend static checks ---------------------------------------- */

console.log('\nFrontend');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/dashboard.css'), 'utf8');

test('index.html loads all five scripts', () => {
  ['api.js', 'auth.js', 'router.js', 'dashboard.js', 'app.js']
    .forEach((f) => assert(html.includes(f), `missing script: ${f}`));
});

test('index.html has a view container per module', () => {
  ['dashboard', 'scout', 'studio', 'sales', 'models', 'settings']
    .forEach((v) => assert(html.includes(`id="view-${v}"`), `missing view: ${v}`));
});

test('sidebar carries the Scorpion brand', () => {
  assert(html.includes('brand-name'), 'no brand element');
  assert(html.includes('Scorpion'), 'no brand text');
});

test('CSS defines the specified palette', () => {
  ['#0a0a0f', '#12121a', '#1a1a2e', '#2a2a3a', '#00d4aa']
    .forEach((c) => assert(css.toLowerCase().includes(c), `missing color ${c}`));
});

test('CSS includes responsive breakpoints', () => {
  assert(css.includes('@media (max-width: 900px)'), 'no tablet breakpoint');
  assert(css.includes('@media (max-width: 560px)'), 'no mobile breakpoint');
});

test('CSS includes skeleton loading states', () => {
  assert(css.includes('.skeleton'), 'no skeleton class');
  assert(css.includes('@keyframes shimmer'), 'no shimmer animation');
});

test('no TODO or placeholder markers in source', () => {
  const files = [
    'assets/js/app.js', 'assets/js/api.js', 'assets/js/auth.js', 'assets/js/router.js',
    'assets/js/dashboard.js', 'scripts/orchestrate.js', 'scripts/arena-router.js',
    'scripts/fable-agent.js', 'modules/product-scout/scout.js',
    'modules/content-studio/studio.js', 'modules/sales-tracker/tracker.js',
  ];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(!/\bTODO\b|\bFIXME\b|placeholder implementation/i.test(src), `${f} contains a placeholder marker`);
  });
});

/* ---------- summary ------------------------------------------------------- */

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
