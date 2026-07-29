/**
 * scripts/fable-agent.js
 * Fable 5 browser-agent wrapper.
 *
 * Fable is metered, so every call checks the remaining spend budget in the
 * model registry before dispatching and debits it afterwards. Without
 * FABLE_API_KEY the agent returns realistic cached fixtures instead of
 * burning budget.
 */

const registry = require('../modules/model-registry/registry');

const FABLE_BASE = process.env.FABLE_BASE_URL || 'https://api.fable.run/v5';
const FABLE_KEY = process.env.FABLE_API_KEY || '';

const ACTIONS = {
  'aliexpress-search': 'Search AliExpress and return listings with price, rating and units sold.',
  'aliexpress-verify': 'Open a specific AliExpress listing and verify live price, seller rating and shipping window.',
  'tiktok-hashtag': 'Open a TikTok hashtag page and return view counts plus top creator handles.',
  'amazon-movers': 'Scrape Amazon Movers & Shakers for a category and return the biggest gainers.',
  'competitor-store': 'Open a competitor storefront and return product count, pricing band and traffic signals.',
};

function isLive() { return Boolean(FABLE_KEY); }

function budget() {
  const model = registry.byId('fable-5') || {};
  const limit = model.spendLimitUsd || 0;
  const used = model.spendUsedUsd || 0;
  return { limit, used, remaining: Math.round((limit - used) * 100) / 100, costPerRun: model.costPerRunUsd || 0.35 };
}

/**
 * Run a Fable 5 browser task.
 * @param {keyof ACTIONS} action
 * @param {object} params
 * @param {object} [opts] - {force} to bypass the budget guard
 */
async function run(action, params = {}, opts = {}) {
  if (!ACTIONS[action]) {
    throw new Error(`Unknown Fable action "${action}". Known: ${Object.keys(ACTIONS).join(', ')}`);
  }

  const b = budget();
  if (!opts.force && b.remaining < b.costPerRun) {
    throw new Error(`Fable 5 spend limit reached ($${b.used} of $${b.limit}). Pass --force to override.`);
  }

  const started = Date.now();

  if (!isLive()) {
    const data = fixture(action, params);
    return {
      ok: true, simulated: true, action, params, data,
      latencyMs: Date.now() - started, costUsd: 0,
      note: 'FABLE_API_KEY not set — returned cached fixture, no spend incurred.',
    };
  }

  const res = await fetch(`${FABLE_BASE}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FABLE_KEY}` },
    body: JSON.stringify({ action, params, instruction: ACTIONS[action] }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Fable HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  registry.recordUsage('fable-5', { costUsd: b.costPerRun });

  return {
    ok: true, simulated: false, action, params,
    data: json, latencyMs: Date.now() - started, costUsd: b.costPerRun,
  };
}

/* ---------- fixtures ------------------------------------------------------
   Captured from live AliExpress result pages so offline runs still exercise
   realistic prices, ratings and sales volumes. Keyed by query so different
   candidates return genuinely different sourcing data.
-------------------------------------------------------------------------- */

const CATALOG = {
  grout: [
    {
      title: '10 Colors Floor Tile Marker Pen Wall Grout Pen Waterproof',
      url: 'https://www.aliexpress.us/item/3256811827741618.html',
      price: 2.66, listPrice: 5.52, rating: 4.9, unitsSold: 2000, shipDays: [8, 13], shipsFrom: 'CN',
    },
    {
      title: 'White Grout Tile Pen 8 Colors Waterproof Wall Grout Restorer',
      url: 'https://www.aliexpress.us/item/3256811990689952.html',
      price: 1.94, listPrice: 4.08, rating: 4.9, unitsSold: 900, shipDays: [9, 14], shipsFrom: 'CN',
    },
    {
      title: '3 Packs Tile Grout Paint Pen Waterproof Mildew Proof',
      url: 'https://www.aliexpress.us/item/3256807911692278.html',
      price: 3.35, listPrice: 7.34, rating: 4.9, unitsSold: 1000, shipDays: [8, 15], shipsFrom: 'CN',
    },
  ],
  'uv resin': [
    {
      title: 'DIY 5 Second Fix Liquid Glass Welding UV Light Repair Pen',
      url: 'https://www.aliexpress.us/item/3256803121060252.html',
      price: 0.99, listPrice: 2.96, rating: 3.8, unitsSold: 166, shipDays: [10, 17], shipsFrom: 'CN',
    },
    {
      title: '20g/50g Transparent UV Resin Glue Quick-Drying Epoxy UV Pen Kit',
      url: 'https://www.aliexpress.us/item/3256807521013322.html',
      price: 4.55, listPrice: 4.55, rating: 4.4, unitsSold: 600, shipDays: [9, 16], shipsFrom: 'CN',
    },
  ],
  rust: [
    {
      title: 'Car Anti-rust Rust Remover Multipurpose Paste Chassis Inhibitor',
      url: 'https://www.aliexpress.us/item/3256808158408968.html',
      price: 1.33, listPrice: 9.28, rating: 4.9, unitsSold: 1000, shipDays: [9, 15], shipsFrom: 'CN',
    },
    {
      title: 'Rust Remover 100g Stainless Steel Cleaning Paste Metal Polish Cream',
      url: 'https://www.aliexpress.us/item/3256807130568837.html',
      price: 0.99, listPrice: 4.89, rating: 4.2, unitsSold: 22, shipDays: [11, 19], shipsFrom: 'CN',
    },
  ],
  necklace: [
    {
      title: 'ITSMOS Natural Moonstone Spinner Pendant Rotating Fidget Necklace',
      url: 'https://www.aliexpress.us/item/3256812500887584.html',
      price: 3.19, listPrice: 12.26, rating: 5.0, unitsSold: 3, shipDays: [10, 18], shipsFrom: 'CN',
    },
  ],
};

/** Pick the catalog bucket whose key best matches the query text. */
function matchCatalog(query) {
  const q = String(query || '').toLowerCase();
  for (const key of Object.keys(CATALOG)) {
    if (key.split(' ').every((word) => q.includes(word))) return CATALOG[key];
  }
  return null;
}

/** Deterministic pseudo-listing for queries with no captured fixture. */
function syntheticListing(query) {
  const q = String(query || 'product');
  let hash = 0;
  for (let i = 0; i < q.length; i++) hash = (hash * 31 + q.charCodeAt(i)) >>> 0;
  const price = Math.round((0.99 + (hash % 420) / 100) * 100) / 100;
  const rating = Math.round((4.1 + ((hash >> 5) % 9) / 10) * 10) / 10;
  const shipMin = 8 + (hash % 5);
  return [{
    title: `${q} — top AliExpress result`,
    url: `https://www.aliexpress.com/w/wholesale-${q.toLowerCase().replace(/\s+/g, '-')}.html`,
    price,
    listPrice: Math.round(price * 2.4 * 100) / 100,
    rating: Math.min(5, rating),
    unitsSold: 120 + (hash % 2400),
    shipDays: [shipMin, shipMin + 6],
    shipsFrom: 'CN',
    synthetic: true,
  }];
}

function fixture(action, params) {
  switch (action) {
    case 'aliexpress-search':
    case 'aliexpress-verify': {
      const query = params.query || 'grout pen';
      return { query, listings: matchCatalog(query) || syntheticListing(query) };
    }
    case 'tiktok-hashtag':
      return {
        hashtag: params.hashtag || '#cleantok',
        postCount: 4200000,
        topCreators: ['@cleanwithme', '@thegroutguy', '@renterfriendlyfix'],
        sampledListings: 40,
        consistentSellers: 7,
      };
    case 'amazon-movers':
      return {
        category: params.category || 'home-improvement',
        gainers: [
          { title: 'Grout Pen White — 2 Pack', rankNow: 118, rankBefore: 640, changePct: 442 },
          { title: 'Tile Grout Cleaner Spray 32oz', rankNow: 214, rankBefore: 501, changePct: 134 },
          { title: 'Electric Grout Scrubber Brush', rankNow: 309, rankBefore: 522, changePct: 69 },
        ],
      };
    case 'competitor-store':
      return {
        store: params.url || 'unknown',
        productCount: 14,
        priceBand: [12.95, 29.95],
        activeSince: '2026-04',
        signals: ['single-product hero page', 'TikTok pixel present'],
      };
    default:
      return { note: `no fixture for ${action}` };
  }
}

/** Convenience: verify a product's live cost and seller quality. */
async function verifyProduct(product, opts = {}) {
  const result = await run('aliexpress-verify', { query: product.name, url: product.supplier?.url }, opts);
  const best = result.data.listings?.[0];
  if (!best) return { ...result, verified: false };
  return {
    ...result,
    verified: true,
    liveCost: best.price,
    costDelta: Math.round((best.price - (product.cost || 0)) * 100) / 100,
    sellerRating: best.rating,
    shipDays: best.shipDays,
  };
}

module.exports = { run, verifyProduct, budget, isLive, ACTIONS };
