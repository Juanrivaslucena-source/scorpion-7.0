/**
 * scripts/arena-router.js
 * Node-side Arena.ai integration. Routes a task to the best specialist model
 * from the registry and returns a normalized envelope.
 *
 * Without ARENA_API_KEY the router runs in simulated mode and returns
 * deterministic, schema-correct payloads so the whole pipeline is runnable
 * offline.
 */

const registry = require('../modules/model-registry/registry');

const ARENA_BASE = process.env.ARENA_BASE_URL || 'https://api.arena.ai/v1';
const ARENA_KEY = process.env.ARENA_API_KEY || '';

const SYSTEM_PROMPTS = {
  'trend-research':
    'You are a trend research specialist. Return JSON: {items:[{name, evidence, momentum, source}]}. Momentum is one of rising|peaking|cooling|flat.',
  'product-scout':
    'You are a dropshipping product scout. Return JSON: {candidates:[{name, category, estimatedCost, suggestedPrice, whyNow}]}.',
  'margin-analysis':
    'You are a unit-economics analyst. Return JSON: {cost, salePrice, marginPct, breakEvenUnits, verdict}.',
  'saturation-check':
    'You are a competitive analyst. Return JSON: {score, activeSellers, evidence}. Score is low|medium|high.',
  'hook-generation':
    'You write short-form video hooks that land in under 3 seconds. Return JSON: {hooks:[string]}.',
  'listing-copy':
    'You write high-converting ecommerce listings. Return JSON: {title, bullets:[string], description}.',
  'sales-analysis':
    'You are a revenue analyst. Return JSON: {trend, topProduct, recommendation, projectedRevenue30d}.',
  'image-analysis':
    'You evaluate product imagery for short-form video suitability. Return JSON: {score, issues:[string], bestFrame}.',
};

function isLive() { return Boolean(ARENA_KEY); }

/**
 * Route and execute a task.
 * @param {string} taskType
 * @param {object} payload
 * @param {object} [opts] - {model, escalate, temperature, costCeilingUsd}
 */
async function route(taskType, payload = {}, opts = {}) {
  const choice = registry.select(taskType, { ...opts, task: payload });
  if (!choice) {
    throw new Error(`No usable model for "${taskType}" within the cost ceiling.`);
  }

  const started = Date.now();
  const body = {
    model: choice.model.id,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS[taskType] || 'You are a Scorpion specialist agent. Return JSON only.' },
      { role: 'user', content: `Task: ${taskType}\nPayload: ${JSON.stringify(payload, null, 2)}` },
    ],
    temperature: opts.temperature != null ? opts.temperature : 0.4,
  };

  if (!isLive()) {
    const data = simulate(taskType, payload);
    return envelope(choice, data, Date.now() - started, true);
  }

  const res = await fetch(`${ARENA_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ARENA_KEY}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Arena HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? '';
  registry.recordUsage(choice.model.id, { costUsd: choice.estimatedCostUsd });
  return envelope(choice, parseJson(content), Date.now() - started, false, json);
}

function envelope(choice, data, latencyMs, simulated, raw) {
  return {
    ok: true,
    simulated,
    model: choice.model.id,
    modelLabel: choice.model.label,
    reason: choice.reason,
    estimatedCostUsd: choice.estimatedCostUsd,
    latencyMs,
    data,
    raw,
  };
}

function parseJson(text) {
  if (!text) return {};
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate); }
  catch { return { text: String(text).trim() }; }
}

/* ---------- simulated responses ----------------------------------------- */

function simulate(taskType, payload) {
  switch (taskType) {
    case 'trend-research':
      return {
        items: [
          { name: 'Grout restoration pen', evidence: 'CleanTok transformation demos recirculating', momentum: 'rising', source: 'TikTok #cleantok' },
          { name: 'Heatless curling ribbon', evidence: 'Overnight before/after format still converting', momentum: 'peaking', source: 'TikTok #beautytok' },
          { name: 'Magnetic gym phone mount', evidence: 'Creator fitness accessories climbing YoY', momentum: 'rising', source: 'Amazon Sports' },
        ],
      };
    case 'product-scout':
      return {
        candidates: [
          { name: 'Grout Restore Pen', category: 'home', estimatedCost: 2.66, suggestedPrice: 19.95, whyNow: 'Instant visual transformation, sub-3s hook, medium saturation.' },
          { name: 'UV Resin Repair Pen', category: 'tech', estimatedCost: 0.99, suggestedPrice: 16.95, whyNow: 'Liquid-glass weld reveal reads as magic on camera.' },
          { name: 'Rust Remover Gel', category: 'auto', estimatedCost: 1.33, suggestedPrice: 14.95, whyNow: 'Before/after metal restoration is evergreen satisfying content.' },
        ],
      };
    case 'margin-analysis': {
      const cost = payload.cost ?? 2.66;
      const salePrice = payload.salePrice ?? 19.95;
      const marginPct = Math.round(((salePrice - cost) / salePrice) * 1000) / 10;
      return {
        cost, salePrice, marginPct,
        breakEvenUnits: Math.ceil(50 / Math.max(0.01, salePrice - cost)),
        verdict: marginPct >= 66 ? 'clears the 3x threshold' : 'below the 3x threshold',
      };
    }
    case 'saturation-check':
      return { score: 'medium', activeSellers: 7, evidence: 'Sampled 40 listings; 7 storefronts posting consistently.' };
    case 'hook-generation': {
      const name = payload.productName || 'this';
      const price = payload.salePrice ? `$${payload.salePrice}` : 'this';
      const pool = [
        `POV: you found the ${price} version of a $600 job`,
        `Nobody told me ${String(name).toLowerCase()} could do this`,
        'One pass. No scrubbing. Watch.',
        'This should be illegal for the price',
        'I was quoted four figures for this exact result',
        'Do NOT buy the expensive version first',
        'Watch what happens in the last 3 seconds',
      ];
      // rotate the pool by product name so different products get different hooks
      let h = 0;
      for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
      const offset = h % pool.length;
      const rotated = pool.slice(offset).concat(pool.slice(0, offset));
      return { hooks: rotated.slice(0, payload.count || 5) };
    }
    case 'listing-copy':
      return {
        title: 'Grout Restore Pen — Instant Tile Line Renewal Kit',
        bullets: [
          'Restores stained grout in one pass — no scrubbing, no regrouting',
          'Waterproof, mildew-resistant formula for bath, kitchen and floor tile',
          '10 color-matched options plus 3 adjustable tip widths',
          'Covers an average bathroom in under 20 minutes',
        ],
        description: 'Dingy grout makes clean tile look filthy. The Grout Restore Pen lays down an opaque, waterproof line that dries in minutes and resists mildew.',
      };
    case 'sales-analysis':
      return {
        trend: 'up',
        topProduct: 'prd_grout01',
        recommendation: 'Shift content budget toward the grout pen; retire the pet brush.',
        projectedRevenue30d: 6400,
      };
    case 'image-analysis':
      return { score: 0.82, issues: ['Primary image has supplier watermark'], bestFrame: 'image_3.jpg' };
    default:
      return { note: `simulated ${taskType}`, payload };
  }
}

module.exports = { route, isLive, simulate, SYSTEM_PROMPTS };
