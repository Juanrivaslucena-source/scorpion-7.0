#!/usr/bin/env node
/**
 * scripts/seed.js
 * Copies the demo seed data in data/seed/ into the live data files the
 * dashboard reads. Safe to re-run: it overwrites the live files and keeps a
 * single .bak of whatever was there before.
 *
 *   node scripts/seed.js            # seed everything
 *   node scripts/seed.js --force    # skip the "already seeded" guard
 *   node scripts/seed.js --dry-run  # show what would happen
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const SEED = path.join(DATA, 'seed');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY = args.includes('--dry-run');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const round2 = (n) => Math.round(n * 100) / 100;

function writeJson(target, value) {
  if (DRY) {
    console.log(`  [dry-run] would write ${path.relative(ROOT, target)}`);
    return;
  }
  if (fs.existsSync(target)) {
    fs.copyFileSync(target, `${target}.bak`);
  }
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`  wrote ${path.relative(ROOT, target)}`);
}

function buildProducts() {
  const products = readJson(path.join(SEED, 'products-seed.json'));
  return {
    updatedAt: new Date().toISOString(),
    count: products.length,
    products,
  };
}

function buildContent() {
  const clips = readJson(path.join(SEED, 'content-seed.json'));
  const published = clips.filter((c) => c.status === 'published');
  const totalViews = clips.reduce((s, c) => s + (c.metrics?.views || 0), 0);
  const totalClicks = clips.reduce((s, c) => s + (c.metrics?.clicks || 0), 0);
  return {
    updatedAt: new Date().toISOString(),
    count: clips.length,
    totals: {
      views: totalViews,
      clicks: totalClicks,
      published: published.length,
      clickThroughRatePct: totalViews ? round2((totalClicks / totalViews) * 100) : 0,
    },
    clips,
  };
}

function buildSales() {
  return readJson(path.join(SEED, 'sales-seed.json'));
}

function buildTasks() {
  const tasks = readJson(path.join(SEED, 'tasks-seed.json'));
  return {
    updatedAt: new Date().toISOString(),
    count: tasks.length,
    tasks,
  };
}

function main() {
  const liveProducts = path.join(DATA, 'products.json');
  if (!FORCE && !DRY && fs.existsSync(liveProducts)) {
    try {
      const existing = readJson(liveProducts);
      const isSeeded = Array.isArray(existing.products) && existing.products.length > 0;
      const isDemo = existing.products?.some((p) => String(p.id).startsWith('prd_'));
      if (isSeeded && !isDemo) {
        console.log('data/products.json holds non-demo records. Re-run with --force to overwrite.');
        process.exit(1);
      }
    } catch {
      /* unreadable file — safe to overwrite */
    }
  }

  console.log('Seeding Scorpion demo data...');
  writeJson(path.join(DATA, 'products.json'), buildProducts());
  writeJson(path.join(DATA, 'content.json'), buildContent());
  writeJson(path.join(DATA, 'sales.json'), buildSales());
  writeJson(path.join(DATA, 'tasks.json'), buildTasks());

  if (!DRY) {
    const sales = buildSales();
    console.log(
      `Done. ${sales.totals.orders} orders / $${sales.totals.revenue} revenue across ${sales.daily.length} days.`
    );
  }
}

main();
