/**
 * modules/product-scout/scout.js
 * Product research pipeline.
 *
 *   trend research  → Perplexity (live knowledge)
 *   sourcing        → Fable 5 (live AliExpress verification)
 *   margin + sat.   → GPT-5 Thinking / Claude (analysis)
 *   image QA        → Gemini Flash (vision)
 *
 * Produces structured product cards that satisfy modules/product-scout/product-template.json.
 */

const fs = require('fs');
const path = require('path');
const arena = require('../../scripts/arena-router');
const fable = require('../../scripts/fable-agent');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

const round2 = (n) => Math.round(n * 100) / 100;
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function newId(name) {
  const base = slugify(name).replace(/-/g, '').slice(0, 6) || 'item';
  return `prd_${base}${Math.floor(Math.random() * 90 + 10)}`;
}

function readProducts() {
  try { return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')); }
  catch { return { updatedAt: null, count: 0, products: [] }; }
}

function writeProducts(doc) {
  doc.updatedAt = new Date().toISOString();
  doc.count = doc.products.length;
  fs.writeFileSync(PRODUCTS_FILE, `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

/** Score a candidate against the five Scorpion criteria (0-100). */
function scoreCandidate({ marginPct, momentum, saturation, hasVisualDemo, shipDaysMax }) {
  let score = 0;
  score += Math.min(35, Math.max(0, (marginPct - 50) * 1.0));            // margin, cap 35
  score += { rising: 25, peaking: 18, flat: 8, cooling: 2 }[momentum] ?? 8;
  score += { low: 25, medium: 14, high: 3 }[saturation] ?? 10;
  score += hasVisualDemo ? 10 : 0;
  score += shipDaysMax != null && shipDaysMax <= 14 ? 5 : 0;
  return Math.round(Math.min(100, score));
}

/**
 * Run a full scout cycle.
 * @param {object} opts - {niche, maxCandidates, useFable, dryRun, onLog}
 */
async function runCycle(opts = {}) {
  const {
    niche = 'auto-select',
    maxCandidates = 3,
    useFable = true,
    dryRun = false,
    onLog = () => {},
  } = opts;

  const log = (msg) => { onLog(msg); return msg; };
  const report = { startedAt: new Date().toISOString(), niche, steps: [], candidates: [] };

  // 1. trend research
  log(`Trend research for niche "${niche}"...`);
  const trends = await arena.route('trend-research', { niche, window: '14d' });
  report.steps.push({ step: 'trend-research', model: trends.model, simulated: trends.simulated });
  const trendItems = trends.data.items || [];
  log(`  ${trendItems.length} trend signals from ${trends.modelLabel}`);

  // 2. candidate generation
  const scouted = await arena.route('product-scout', { niche, trends: trendItems, maxCandidates });
  report.steps.push({ step: 'product-scout', model: scouted.model, simulated: scouted.simulated });
  const candidates = (scouted.data.candidates || []).slice(0, maxCandidates);
  log(`  ${candidates.length} candidates proposed`);

  // 3. per-candidate verification + analysis
  const existing = readProducts();
  const deadNames = new Set(
    existing.products.filter((p) => p.stage === 'dead').map((p) => p.name.toLowerCase())
  );

  for (const c of candidates) {
    if (deadNames.has(String(c.name).toLowerCase())) {
      log(`  skip "${c.name}" — previously marked dead`);
      continue;
    }

    let cost = c.estimatedCost;
    let supplier = { platform: 'aliexpress', url: '', sellerRating: null, unitsSold: 0, shipDaysMin: null, shipDaysMax: null };

    if (useFable) {
      try {
        const found = await fable.run('aliexpress-search', { query: c.name });
        const best = (found.data.listings || [])[0];
        if (best) {
          cost = best.price;
          supplier = {
            platform: 'aliexpress',
            url: best.url,
            sellerRating: best.rating,
            unitsSold: best.unitsSold,
            shipDaysMin: best.shipDays?.[0] ?? null,
            shipDaysMax: best.shipDays?.[1] ?? null,
          };
          log(`  sourced "${c.name}" at $${cost} (★${best.rating}, ${best.unitsSold} sold)${found.simulated ? ' [fixture]' : ''}`);
        }
      } catch (err) {
        log(`  Fable unavailable for "${c.name}": ${err.message}`);
      }
    }

    const salePrice = c.suggestedPrice || round2(cost * 6);
    const margin = await arena.route('margin-analysis', { cost, salePrice, productName: c.name });
    const saturation = await arena.route('saturation-check', { productName: c.name, niche: c.category || niche });
    const hooks = await arena.route('hook-generation', { productName: c.name, salePrice, count: 3 });

    const trendMatch = matchTrend(trendItems, c.name) || {};

    const marginPct = margin.data.marginPct ?? round2(((salePrice - cost) / salePrice) * 100);
    const satScore = saturation.data.score || 'medium';

    const card = {
      id: newId(c.name),
      name: c.name,
      slug: slugify(c.name),
      category: c.category || 'novelty',
      stage: 'researching',
      cost: round2(cost),
      salePrice: round2(salePrice),
      marginPct,
      supplier,
      trend: {
        source: trendMatch.source || 'model knowledge',
        hashtag: trendMatch.hashtag || '',
        momentum: trendMatch.momentum || 'flat',
        evidence: trendMatch.evidence || c.whyNow || '',
      },
      saturation: {
        score: satScore,
        activeSellers: saturation.data.activeSellers ?? null,
        evidence: saturation.data.evidence || '',
      },
      contentAngles: hooks.data.hooks || [],
      risks: buildRisks({ marginPct, satScore, shipDaysMax: supplier.shipDaysMax }),
      metrics: { unitsSold: 0, revenue: 0, refundRatePct: 0, conversionRatePct: 0 },
      scoutScore: scoreCandidate({
        marginPct,
        momentum: trendMatch.momentum || 'flat',
        saturation: satScore,
        hasVisualDemo: true,
        shipDaysMax: supplier.shipDaysMax,
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    report.candidates.push(card);
    log(`  scored "${card.name}" → ${card.scoutScore}/100 (${card.marginPct}% margin, ${satScore} saturation)`);
  }

  report.candidates.sort((a, b) => b.scoutScore - a.scoutScore);
  report.completedAt = new Date().toISOString();
  report.recommendation = report.candidates[0]
    ? `${report.candidates[0].name} — ${report.candidates[0].scoutScore}/100`
    : 'no viable candidates this cycle';

  if (!dryRun && report.candidates.length) {
    const doc = readProducts();
    const known = new Set(doc.products.map((p) => p.slug));
    const fresh = report.candidates.filter((c) => !known.has(c.slug));
    doc.products = doc.products.concat(fresh);
    writeProducts(doc);
    log(`Persisted ${fresh.length} new product card(s) to data/products.json`);
  }

  return report;
}

/**
 * Match a candidate to the trend signal that actually mentions it, by scoring
 * shared significant words. Returns null when nothing overlaps, so unrelated
 * products don't inherit each other's trend evidence.
 */
function matchTrend(trendItems, productName) {
  const stop = new Set(['the', 'and', 'for', 'with', 'pen', 'kit', 'set', 'pro', 'mini']);
  const words = (s) => new Set(
    String(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w))
  );
  const target = words(productName);

  let best = null;
  let bestScore = 0;
  for (const item of trendItems) {
    const candidate = words(item.name);
    let overlap = 0;
    candidate.forEach((w) => { if (target.has(w)) overlap++; });
    if (overlap > bestScore) { bestScore = overlap; best = item; }
  }
  return bestScore > 0 ? best : null;
}

function buildRisks({ marginPct, satScore, shipDaysMax }) {
  const risks = [];
  if (marginPct < 66) risks.push('Margin under the 3x threshold — reprice or drop');
  if (satScore === 'high') risks.push('High saturation — expect price compression');
  if (satScore === 'medium') risks.push('Medium saturation — differentiate on creative, not price');
  if (shipDaysMax && shipDaysMax > 14) risks.push(`Long shipping window (${shipDaysMax}d) drives chargebacks`);
  risks.push('Trend decay — re-verify momentum every 7 days');
  return risks;
}

/** Render a scout report as the Markdown format the Director layer expects. */
function toMarkdown(report, index = 1) {
  const lines = [];
  lines.push(`# Product Scout Report #${index}`);
  lines.push('');
  lines.push(`Date: ${report.completedAt || new Date().toISOString()}`);
  lines.push('Generated by: Arena.ai + Fable 5');
  lines.push('');

  report.candidates.forEach((c, i) => {
    lines.push(`## Product ${i + 1}: ${c.name}`);
    lines.push('');
    lines.push(`- AliExpress Link: ${c.supplier.url || 'n/a'}`);
    lines.push(`- Cost: $${c.cost} | Sale Price: $${c.salePrice} | Margin: ${c.marginPct}%`);
    lines.push(`- Trend Source: ${c.trend.source}${c.trend.hashtag ? ` (${c.trend.hashtag})` : ''}`);
    lines.push(`- Content Angles: ${c.contentAngles.map((h) => `"${h}"`).join(' / ')}`);
    lines.push(`- Saturation Score: ${c.saturation.score} — ${c.saturation.evidence}`);
    lines.push(`- Risk: ${c.risks.join('; ')}`);
    lines.push('');
  });

  lines.push('## Recommendation');
  lines.push('');
  lines.push(report.recommendation);
  lines.push('');
  return lines.join('\n');
}

module.exports = { runCycle, toMarkdown, scoreCandidate, matchTrend, readProducts, writeProducts, PRODUCTS_FILE };
