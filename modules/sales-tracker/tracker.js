/**
 * modules/sales-tracker/tracker.js
 * Ingests order data from Shopify / TikTok Shop / Amazon, normalizes it into
 * the ledger shape in sales-schema.json, and recalculates revenue metrics.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

const round2 = (n) => Math.round(n * 100) / 100;

function readSales() {
  try { return JSON.parse(fs.readFileSync(SALES_FILE, 'utf8')); }
  catch {
    return {
      currency: 'USD', updatedAt: null, periodStart: null, periodEnd: null,
      totals: { revenue: 0, cogs: 0, grossProfit: 0, orders: 0, averageOrderValue: 0, marginPct: 0 },
      byChannel: {}, daily: [], orders: [],
    };
  }
}

function readProducts() {
  try { return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')).products || []; }
  catch { return []; }
}

function writeSales(doc) {
  fs.writeFileSync(SALES_FILE, `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

/* ---------- normalizers --------------------------------------------------- */

const NORMALIZERS = {
  shopify: (raw) => ({
    id: `ord_${String(raw.id || raw.order_number)}`,
    date: (raw.created_at || raw.processed_at || '').slice(0, 10),
    productId: raw.line_items?.[0]?.sku || raw.productId,
    channel: 'shopify',
    quantity: raw.line_items?.[0]?.quantity ?? raw.quantity ?? 1,
    unitPrice: Number(raw.line_items?.[0]?.price ?? raw.unitPrice ?? 0),
    unitCost: Number(raw.unitCost ?? 0),
    status: raw.financial_status === 'refunded' ? 'refunded'
      : raw.fulfillment_status === 'fulfilled' ? 'delivered' : 'paid',
  }),

  'tiktok-shop': (raw) => ({
    id: `ord_${String(raw.order_id || raw.id)}`,
    date: (raw.create_time_iso || raw.date || '').slice(0, 10),
    productId: raw.sku_id || raw.productId,
    channel: 'tiktok-shop',
    quantity: raw.quantity ?? 1,
    unitPrice: Number(raw.payment?.total_amount ?? raw.unitPrice ?? 0),
    unitCost: Number(raw.unitCost ?? 0),
    status: raw.order_status === 'CANCELLED' ? 'refunded'
      : raw.order_status === 'COMPLETED' ? 'delivered' : 'shipped',
  }),

  amazon: (raw) => ({
    id: `ord_${String(raw.AmazonOrderId || raw.id)}`,
    date: (raw.PurchaseDate || raw.date || '').slice(0, 10),
    productId: raw.SellerSKU || raw.productId,
    channel: 'amazon',
    quantity: Number(raw.QuantityOrdered ?? 1),
    unitPrice: Number(raw.OrderTotal?.Amount ?? raw.unitPrice ?? 0),
    unitCost: Number(raw.unitCost ?? 0),
    status: raw.OrderStatus === 'Canceled' ? 'refunded' : 'shipped',
  }),
};

/**
 * Normalize a batch of raw orders from one channel.
 * @param {'shopify'|'tiktok-shop'|'amazon'} channel
 * @param {Array<object>} rawOrders
 */
function normalize(channel, rawOrders = []) {
  const fn = NORMALIZERS[channel];
  if (!fn) throw new Error(`No normalizer for channel "${channel}".`);
  const costs = Object.fromEntries(readProducts().map((p) => [p.id, p.cost]));

  return rawOrders.map((raw) => {
    const order = fn(raw);
    if (!order.unitCost && costs[order.productId] != null) order.unitCost = costs[order.productId];
    return order;
  }).filter((o) => o.date && o.productId);
}

/** Recompute totals, channel split and the daily series from the order list. */
function recalculate(doc) {
  const orders = doc.orders || [];
  const live = orders.filter((o) => o.status !== 'refunded');

  const revenue = round2(live.reduce((s, o) => s + o.unitPrice * o.quantity, 0));
  const cogs = round2(live.reduce((s, o) => s + (o.unitCost || 0) * o.quantity, 0));

  const byChannel = {};
  for (const o of orders) {
    const c = (byChannel[o.channel] ||= { revenue: 0, orders: 0 });
    if (o.status !== 'refunded') c.revenue = round2(c.revenue + o.unitPrice * o.quantity);
    c.orders += 1;
  }

  const dates = [...new Set(orders.map((o) => o.date))].sort();
  const dailyMap = Object.fromEntries(
    dates.map((d) => [d, { date: d, revenue: 0, orders: 0, cogs: 0, channels: {} }])
  );
  for (const o of orders) {
    const d = dailyMap[o.date];
    d.orders += 1;
    if (o.status === 'refunded') continue;
    const rev = o.unitPrice * o.quantity;
    d.revenue = round2(d.revenue + rev);
    d.cogs = round2(d.cogs + (o.unitCost || 0) * o.quantity);
    d.channels[o.channel] = round2((d.channels[o.channel] || 0) + rev);
  }

  doc.currency = doc.currency || 'USD';
  doc.updatedAt = new Date().toISOString();
  doc.periodStart = dates[0] || null;
  doc.periodEnd = dates[dates.length - 1] || null;
  doc.byChannel = byChannel;
  doc.daily = dates.map((d) => dailyMap[d]);
  doc.totals = {
    revenue,
    cogs,
    grossProfit: round2(revenue - cogs),
    orders: live.length,
    averageOrderValue: live.length ? round2(revenue / live.length) : 0,
    marginPct: revenue ? round2(((revenue - cogs) / revenue) * 100) : 0,
  };
  return doc;
}

/**
 * Ingest raw orders and persist the updated ledger.
 * Deduplicates by order id.
 */
function ingest(channel, rawOrders, opts = {}) {
  const incoming = normalize(channel, rawOrders);
  const doc = readSales();
  const known = new Set((doc.orders || []).map((o) => o.id));
  const fresh = incoming.filter((o) => !known.has(o.id));

  doc.orders = (doc.orders || []).concat(fresh).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1
  );
  recalculate(doc);

  if (!opts.dryRun) writeSales(doc);
  (opts.onLog || (() => {}))(
    `Ingested ${fresh.length} new order(s) from ${channel} (${incoming.length - fresh.length} duplicates skipped)`
  );

  return { added: fresh.length, skipped: incoming.length - fresh.length, totals: doc.totals };
}

/* ---------- reporting ----------------------------------------------------- */

/** Revenue over the trailing N days plus the delta against the prior window. */
function window(days = 7, doc = readSales()) {
  const daily = doc.daily || [];
  const recent = daily.slice(-days);
  const prior = daily.slice(-days * 2, -days);
  const sum = (a) => round2(a.reduce((s, d) => s + d.revenue, 0));
  const current = sum(recent);
  const previous = sum(prior);
  return {
    days, current, previous,
    deltaPct: previous > 0 ? round2(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0),
    ordersInWindow: recent.reduce((s, d) => s + d.orders, 0),
  };
}

/** Per-product revenue leaderboard. */
function byProduct(doc = readSales()) {
  const products = Object.fromEntries(readProducts().map((p) => [p.id, p]));
  const acc = {};
  for (const o of doc.orders || []) {
    if (o.status === 'refunded') continue;
    const a = (acc[o.productId] ||= { productId: o.productId, name: products[o.productId]?.name || o.productId, revenue: 0, units: 0, cogs: 0 });
    a.revenue = round2(a.revenue + o.unitPrice * o.quantity);
    a.cogs = round2(a.cogs + (o.unitCost || 0) * o.quantity);
    a.units += o.quantity;
  }
  return Object.values(acc)
    .map((a) => ({ ...a, grossProfit: round2(a.revenue - a.cogs) }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Straight-line projection to a 30-day figure from the last 7 days. */
function project(doc = readSales()) {
  const w = window(7, doc);
  const daily = w.current / 7;
  return {
    dailyAverage: round2(daily),
    projected30d: round2(daily * 30),
    basis: 'trailing 7-day average',
  };
}

module.exports = {
  ingest, normalize, recalculate, window, byProduct, project,
  readSales, writeSales, SALES_FILE, NORMALIZERS,
};
