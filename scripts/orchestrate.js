#!/usr/bin/env node
/**
 * scripts/orchestrate.js
 * Main orchestration loop.
 *
 * Reads the task queue from data/tasks.json, routes each task to the right
 * service (Arena.ai specialists, Fable 5 browser agent, RunwayML), writes the
 * results back into the data files, and marks the task done or failed.
 *
 * Usage:
 *   node scripts/orchestrate.js                  # drain the queue once, then watch
 *   node scripts/orchestrate.js --once           # drain the queue and exit
 *   node scripts/orchestrate.js --task product-scout --once
 *   node scripts/orchestrate.js --interval 30    # poll every 30s
 *   node scripts/orchestrate.js --dry-run        # never write data files
 */

const fs = require('fs');
const path = require('path');

const arena = require('./arena-router');
const fable = require('./fable-agent');
const registry = require('../modules/model-registry/registry');
const scout = require('../modules/product-scout/scout');
const studio = require('../modules/content-studio/studio');
const tracker = require('../modules/sales-tracker/tracker');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const PIPELINE_DIR = path.join(ROOT, 'pipeline');

/* ---------- cli ----------------------------------------------------------- */

function parseArgs(argv) {
  const args = { once: false, dryRun: false, interval: 15, task: null, payload: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--interval') args.interval = Number(argv[++i]) || 15;
    else if (a === '--task') args.task = argv[++i];
    else if (a === '--payload') { try { args.payload = JSON.parse(argv[++i]); } catch { args.payload = {}; } }
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const COLORS = { dim: '\x1b[2m', green: '\x1b[32m', red: '\x1b[31m', cyan: '\x1b[36m', yellow: '\x1b[33m', reset: '\x1b[0m' };
const stamp = () => new Date().toISOString().slice(11, 19);
const log = (msg, color = 'reset') => console.log(`${COLORS.dim}[${stamp()}]${COLORS.reset} ${COLORS[color]}${msg}${COLORS.reset}`);

/* ---------- task store ---------------------------------------------------- */

function readTasks() {
  try { return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8')); }
  catch { return { updatedAt: null, count: 0, tasks: [] }; }
}

function writeTasks(doc, dryRun) {
  if (dryRun) return doc;
  doc.updatedAt = new Date().toISOString();
  doc.count = doc.tasks.length;
  fs.writeFileSync(TASKS_FILE, `${JSON.stringify(doc, null, 2)}\n`);
  return doc;
}

function appendLog(task, msg) {
  (task.log ||= []).push({ t: new Date().toISOString(), msg });
  log(`  ${msg}`, 'dim');
}

/* ---------- handlers ------------------------------------------------------ */

const HANDLERS = {
  'product-scout': async (task, opts) => {
    const report = await scout.runCycle({
      niche: task.payload?.niche || 'auto-select',
      maxCandidates: task.payload?.maxCandidates || 3,
      useFable: task.payload?.useFable !== false,
      dryRun: opts.dryRun,
      onLog: (m) => appendLog(task, m),
    });

    if (!opts.dryRun && report.candidates.length) {
      fs.mkdirSync(PIPELINE_DIR, { recursive: true });
      const existing = fs.readdirSync(PIPELINE_DIR).filter((f) => /^product-scout-report-\d+\.md$/.test(f));
      const index = existing.length + 1;
      const file = path.join(PIPELINE_DIR, `product-scout-report-${index}.md`);
      fs.writeFileSync(file, scout.toMarkdown(report, index));
      appendLog(task, `Wrote pipeline/product-scout-report-${index}.md`);
    }

    return {
      candidates: report.candidates.length,
      recommendation: report.recommendation,
      top: report.candidates.slice(0, 3).map((c) => ({ name: c.name, score: c.scoutScore, marginPct: c.marginPct })),
    };
  },

  'content-generation': async (task, opts) => {
    const products = scout.readProducts().products;
    const product = products.find((p) => p.id === task.payload?.productId)
      || products.find((p) => ['winning', 'active'].includes(p.stage));
    if (!product) throw new Error('No eligible product for content generation.');

    const { clips } = await studio.runCycle(product, {
      count: task.payload?.count || 3,
      dryRun: opts.dryRun,
      onLog: (m) => appendLog(task, m),
    });
    return { productId: product.id, clipsCreated: clips.length, hooks: clips.map((c) => c.hook) };
  },

  'video-generation': async (task, opts) => {
    const content = studio.readContent();
    const clip = content.clips.find((c) => c.id === task.payload?.clipId)
      || content.clips.find((c) => c.status === 'queued');
    if (!clip) throw new Error('No clip queued for rendering.');

    const result = await studio.renderClip(clip, { force: opts.dryRun });
    appendLog(task, `Runway job ${result.jobId} (${result.creditsUsed} credits)`);

    if (!opts.dryRun) {
      clip.status = 'rendering';
      clip.renderEngine = 'runway-gen3';
      clip.runwayCreditsUsed = (clip.runwayCreditsUsed || 0) + result.creditsUsed;
      studio.writeContent(content);
    }
    return { clipId: clip.id, jobId: result.jobId, creditsUsed: result.creditsUsed, simulated: result.simulated };
  },

  'sales-ingest': async (task, opts) => {
    const channel = task.payload?.channel || 'shopify';
    const raw = task.payload?.orders || [];
    if (!raw.length) {
      appendLog(task, 'No raw orders supplied — recalculating existing ledger only.');
      const doc = tracker.recalculate(tracker.readSales());
      if (!opts.dryRun) tracker.writeSales(doc);
      return { recalculated: true, totals: doc.totals };
    }
    return tracker.ingest(channel, raw, { dryRun: opts.dryRun, onLog: (m) => appendLog(task, m) });
  },

  'sales-analysis': async (task) => {
    const doc = tracker.readSales();
    const w = tracker.window(7, doc);
    const leaders = tracker.byProduct(doc).slice(0, 3);
    const projection = tracker.project(doc);

    const res = await arena.route('sales-analysis', {
      window: w, leaders, projection, totals: doc.totals,
    });
    appendLog(task, `Analysis via ${res.modelLabel}${res.simulated ? ' [simulated]' : ''}`);
    return { window: w, leaders, projection, insight: res.data };
  },

  'supplier-verification': async (task, opts) => {
    const products = scout.readProducts().products;
    const product = products.find((p) => p.id === task.payload?.productId);
    if (!product) throw new Error(`Unknown product "${task.payload?.productId}".`);

    const result = await fable.verifyProduct(product, { force: opts.dryRun });
    appendLog(task, `Live cost $${result.liveCost} (delta $${result.costDelta})${result.simulated ? ' [fixture]' : ''}`);

    if (!opts.dryRun && result.verified) {
      product.cost = result.liveCost;
      product.marginPct = Math.round(((product.salePrice - result.liveCost) / product.salePrice) * 1000) / 10;
      product.updatedAt = new Date().toISOString();
      scout.writeProducts({ products });
    }
    return result;
  },
};

/** Anything not explicitly handled goes straight to the Arena router. */
async function fallbackHandler(task) {
  const res = await arena.route(task.type, task.payload || {}, task.opts || {});
  appendLog(task, `Routed to ${res.modelLabel} (${res.reason})${res.simulated ? ' [simulated]' : ''}`);
  return res.data;
}

/* ---------- loop ---------------------------------------------------------- */

async function runTask(task, opts) {
  log(`▶ ${task.title || task.type} [${task.type}]`, 'cyan');
  task.status = 'running';
  task.startedAt = task.startedAt || new Date().toISOString();
  task.progress = 10;

  try {
    const handler = HANDLERS[task.type] || fallbackHandler;
    const result = await handler(task, opts);
    task.status = 'done';
    task.progress = 100;
    task.result = result;
    task.completedAt = new Date().toISOString();
    log(`✓ ${task.title || task.type}`, 'green');
    return task;
  } catch (err) {
    task.status = 'failed';
    task.error = err.message;
    task.completedAt = new Date().toISOString();
    appendLog(task, `FAILED: ${err.message}`);
    log(`✕ ${task.title || task.type} — ${err.message}`, 'red');
    return task;
  }
}

async function drain(opts) {
  const doc = readTasks();
  const pending = doc.tasks.filter((t) => t.status === 'queued' || t.status === 'running');

  if (!pending.length) return 0;
  log(`${pending.length} pending task(s)`, 'yellow');

  for (const task of pending) {
    await runTask(task, opts);
    writeTasks(doc, opts.dryRun);
  }
  return pending.length;
}

function enqueue(type, payload, title) {
  const doc = readTasks();
  const task = {
    id: `tsk_${Date.now().toString(36)}`,
    type,
    title: title || type.replace(/-/g, ' '),
    status: 'queued',
    assignedModel: null,
    progress: 0,
    payload: payload || {},
    createdAt: new Date().toISOString(),
    startedAt: null,
    log: [],
  };
  doc.tasks.unshift(task);
  writeTasks(doc, false);
  return task;
}

function printHelp() {
  console.log(`
Scorpion orchestrator

  node scripts/orchestrate.js [options]

  --once               Drain the queue once and exit
  --task <type>        Enqueue a task before draining
                       (${Object.keys(HANDLERS).join(', ')})
  --payload <json>     JSON payload for --task
  --interval <sec>     Poll interval in watch mode (default 15)
  --dry-run            Never write to data files
  --help               This message

Environment:
  ARENA_API_KEY   live Arena.ai routing   (else simulated)
  FABLE_API_KEY   live Fable 5 browsing   (else cached fixtures)
  RUNWAY_API_KEY  live RunwayML rendering (else simulated)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  log('Scorpion orchestrator starting', 'cyan');
  const summary = registry.summary();
  log(`Registry: ${summary.available} available / ${summary.total} models, ${summary.routes} routes`, 'dim');
  log(`Arena: ${arena.isLive() ? 'LIVE' : 'simulated'} · Fable: ${fable.isLive() ? 'LIVE' : 'fixtures'} · Runway: ${process.env.RUNWAY_API_KEY ? 'LIVE' : 'simulated'}`, 'dim');
  if (args.dryRun) log('DRY RUN — no data files will be written', 'yellow');

  if (args.task) {
    const t = enqueue(args.task, args.payload, `CLI: ${args.task}`);
    log(`Enqueued ${t.id} (${args.task})`, 'dim');
  }

  const processed = await drain(args);
  if (!processed) log('Queue empty', 'dim');

  if (args.once) {
    log('Done', 'green');
    return;
  }

  log(`Watching queue every ${args.interval}s — Ctrl-C to stop`, 'dim');
  setInterval(() => { drain(args).catch((e) => log(e.message, 'red')); }, args.interval * 1000);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { drain, runTask, enqueue, readTasks, writeTasks, HANDLERS };
