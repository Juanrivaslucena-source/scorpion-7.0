/**
 * modules/content-studio/studio.js
 * Turns a product into short-form clip specs, then hands renderable clips to
 * RunwayML. Output conforms to modules/content-studio/clip-template.json.
 */

const fs = require('fs');
const path = require('path');
const arena = require('../../scripts/arena-router');
const registry = require('../model-registry/registry');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');

const RUNWAY_KEY = process.env.RUNWAY_API_KEY || '';
const round2 = (n) => Math.round(n * 100) / 100;

const FORMATS = ['transformation', 'reveal', 'satisfying-demo', 'problem-solution', 'ugc-testimonial'];
const PLATFORMS = ['tiktok', 'reels', 'shorts'];

function newId() {
  return `clp_${Math.random().toString(36).slice(2, 8)}`;
}

function readContent() {
  try { return JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8')); }
  catch { return { updatedAt: null, count: 0, totals: { views: 0, clicks: 0, published: 0, clickThroughRatePct: 0 }, clips: [] }; }
}

function writeContent(doc) {
  const clips = doc.clips || [];
  const views = clips.reduce((s, c) => s + (c.metrics?.views || 0), 0);
  const clicks = clips.reduce((s, c) => s + (c.metrics?.clicks || 0), 0);
  doc.updatedAt = new Date().toISOString();
  doc.count = clips.length;
  doc.totals = {
    views,
    clicks,
    published: clips.filter((c) => c.status === 'published').length,
    clickThroughRatePct: views ? round2((clicks / views) * 100) : 0,
  };
  fs.writeFileSync(CONTENT_FILE, `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

/** Build a three-beat script scaffold for a hook + product. */
function buildScript(product, hook, format) {
  const noun = product.name.toLowerCase();
  const beats = {
    transformation: [
      { t: '0-3s', shot: `Tight shot of the problem state before touching the ${noun}`, text: hook, sfx: 'record scratch' },
      { t: '3-9s', shot: 'Single continuous action, half-treated frame for contrast', text: 'no cuts, no edit', sfx: 'satisfying process audio' },
      { t: '9-15s', shot: 'Pull back to the full result', text: `$${product.salePrice} and 20 minutes`, sfx: 'beat drop' },
    ],
    reveal: [
      { t: '0-3s', shot: 'Object partially hidden, slow push in', text: hook, sfx: 'riser' },
      { t: '3-9s', shot: 'Reveal the mechanism in one unbroken take', text: 'here is the part nobody shows', sfx: 'click' },
      { t: '9-14s', shot: 'Hero product beauty shot', text: 'link in bio', sfx: 'chime' },
    ],
    'satisfying-demo': [
      { t: '0-3s', shot: 'Macro lens on the contact point', text: hook, sfx: 'close-mic texture' },
      { t: '3-11s', shot: 'Slow tracking shot along the working surface', text: '', sfx: 'ambient room tone' },
      { t: '11-16s', shot: 'Rack focus to the finished area', text: 'one pass. that is it.', sfx: 'soft chime' },
    ],
    'problem-solution': [
      { t: '0-3s', shot: 'Screenshot or receipt showing the expensive alternative', text: hook, sfx: 'cash register' },
      { t: '3-10s', shot: 'Unbox and use the product in real time', text: 'I bought this instead', sfx: 'sped-up clicks' },
      { t: '10-15s', shot: 'Split screen: quote vs result', text: 'same outcome, 1% of the price', sfx: 'whoosh' },
    ],
    'ugc-testimonial': [
      { t: '0-3s', shot: 'Handheld selfie framing, genuine reaction', text: hook, sfx: 'raw audio' },
      { t: '3-10s', shot: 'Cut to the product doing the work over the shoulder', text: 'I was not expecting this', sfx: 'natural sound' },
      { t: '10-16s', shot: 'Final result held up to camera', text: 'buying three more', sfx: 'stamp' },
    ],
  };
  return beats[format] || beats.transformation;
}

function hashtagsFor(product) {
  const base = {
    home: ['#cleantok', '#homehacks', '#satisfying'],
    auto: ['#cartok', '#detailing', '#satisfying'],
    beauty: ['#beautytok', '#skincareroutine', '#glowup'],
    pets: ['#pettok', '#petgrooming'],
    fitness: ['#fittok', '#posture'],
    kitchen: ['#kitchenhacks', '#cooktok'],
    tech: ['#gadgets', '#tiktokmademebuyit'],
    apparel: ['#outfitinspo', '#fashiontok'],
    novelty: ['#tiktokmademebuyit', '#oddlysatisfying'],
  };
  return base[product.category] || base.novelty;
}

/**
 * Generate clip specs for a product.
 * @param {object} product
 * @param {object} opts - {count, platform, onLog}
 */
async function generateClips(product, opts = {}) {
  const { count = 3, onLog = () => {} } = opts;

  onLog(`Generating ${count} hooks for "${product.name}"...`);
  const res = await arena.route('hook-generation', {
    productName: product.name,
    category: product.category,
    angles: product.contentAngles || [],
    count,
  });

  const hooks = (res.data.hooks || []).slice(0, count);
  onLog(`  ${hooks.length} hooks from ${res.modelLabel}${res.simulated ? ' [simulated]' : ''}`);

  return hooks.map((hook, i) => {
    const format = FORMATS[i % FORMATS.length];
    const platform = opts.platform || PLATFORMS[i % PLATFORMS.length];
    return {
      id: newId(),
      productId: product.id,
      hook,
      script: buildScript(product, hook, format),
      platform,
      format,
      status: 'draft',
      renderEngine: 'manual',
      runwayCreditsUsed: 0,
      durationSec: 15,
      soundtrack: 'trending audio — check the platform library at post time',
      hashtags: hashtagsFor(product),
      metrics: { views: 0, likes: 0, shares: 0, clicks: 0, conversionRatePct: 0 },
      publishedAt: null,
      createdAt: new Date().toISOString(),
    };
  });
}

/**
 * Send a clip to RunwayML. Debits credits from the registry.
 * Without RUNWAY_API_KEY this returns a simulated job id.
 */
async function renderClip(clip, opts = {}) {
  const model = registry.byId('runway-gen3');
  const creditsNeeded = Math.ceil((clip.durationSec || 5) * (model?.creditsPerSecond || 5));

  if (!opts.force && (model?.creditBalance || 0) < creditsNeeded) {
    throw new Error(`Insufficient RunwayML credits: need ${creditsNeeded}, have ${model?.creditBalance || 0}.`);
  }

  if (!RUNWAY_KEY) {
    registry.recordUsage('runway-gen3', { credits: creditsNeeded });
    return {
      ok: true, simulated: true, clipId: clip.id,
      jobId: `sim_${Math.random().toString(36).slice(2, 10)}`,
      creditsUsed: creditsNeeded,
      note: 'RUNWAY_API_KEY not set — job simulated, credits debited locally for budget tracking.',
    };
  }

  const res = await fetch('https://api.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RUNWAY_KEY}` },
    body: JSON.stringify({
      promptText: `${clip.hook}. ${clip.script?.[0]?.shot || ''}`,
      duration: clip.durationSec || 5,
      ratio: '9:16',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Runway HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  registry.recordUsage('runway-gen3', { credits: creditsNeeded });
  return { ok: true, simulated: false, clipId: clip.id, jobId: json.id, creditsUsed: creditsNeeded, raw: json };
}

/** Generate clips for a product and persist them. */
async function runCycle(product, opts = {}) {
  const clips = await generateClips(product, opts);
  if (opts.dryRun) return { clips, persisted: false };

  const doc = readContent();
  doc.clips = (doc.clips || []).concat(clips);
  writeContent(doc);
  (opts.onLog || (() => {}))(`Persisted ${clips.length} clip(s) to data/content.json`);
  return { clips, persisted: true };
}

module.exports = {
  generateClips, renderClip, runCycle, buildScript, hashtagsFor,
  readContent, writeContent, FORMATS, PLATFORMS, CONTENT_FILE,
};
