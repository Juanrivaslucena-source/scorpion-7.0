/**
 * modules/model-registry/registry.js
 * Node-side catalog of available AI specialists plus the routing decision
 * logic shared by the orchestrator scripts.
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, 'models.json');

let cached = null;

function load(force = false) {
  if (cached && !force) return cached;
  cached = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  return cached;
}

function save(registry) {
  cached = registry;
  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

function all() { return load().models; }

function byId(id) { return all().find((m) => m.id === id) || null; }

function isUsable(model) {
  if (!model) return false;
  if (['offline', 'disabled'].includes(model.status)) return false;
  if (model.id === 'fable-5' && model.spendLimitUsd != null) {
    if ((model.spendUsedUsd || 0) >= model.spendLimitUsd) return false;
  }
  if (model.id === 'runway-gen3' && (model.creditBalance || 0) <= 0) return false;
  return true;
}

function estimateCost(model, task = {}) {
  if (!model) return 0;
  if (model.costPerRunUsd != null) return model.costPerRunUsd;
  if (model.creditsPerSecond != null) {
    const secs = task.durationSec || 5;
    return round2(model.creditsPerSecond * secs * 0.01);
  }
  const kTokens = (task.estimatedTokens || 1500) / 1000;
  return round2((model.costPer1kTokensUsd || 0) * kTokens);
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Pick the best model for a task type.
 * @returns {{model: object, estimatedCostUsd: number, reason: string}|null}
 */
function select(taskType, opts = {}) {
  const registry = load();
  const route = registry.taskRoutes[taskType];
  const policy = registry.routingPolicy || {};
  const ceiling = opts.costCeilingUsd != null ? opts.costCeilingUsd : policy.costCeilingUsdPerTask;

  const candidates = [];
  if (opts.model) candidates.push(opts.model);
  if (route) {
    if (opts.escalate && route.escalate) candidates.push(route.escalate);
    if (route.primary) candidates.push(route.primary);
    if (route.fallback) candidates.push(route.fallback);
  }
  registry.models.forEach((m) => {
    if ((m.capabilities || []).includes(taskType)) candidates.push(m.id);
  });
  if (policy.fallbackModel) candidates.push(policy.fallbackModel);

  const seen = new Set();
  for (const id of candidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    const model = byId(id);
    if (!isUsable(model)) continue;
    const cost = estimateCost(model, opts.task || {});
    if (ceiling != null && cost > ceiling && !opts.model) continue;

    let reason = 'capability match';
    if (opts.model === id) reason = 'explicit override';
    else if (route && route.escalate === id && opts.escalate) reason = 'escalated to live browser agent';
    else if (route && route.primary === id) reason = 'primary route';
    else if (route && route.fallback === id) reason = 'fallback route';

    return { model, estimatedCostUsd: cost, reason };
  }
  return null;
}

/** Debit metered resources after a run so budgets stay honest. */
function recordUsage(modelId, usage = {}) {
  const registry = load();
  const model = registry.models.find((m) => m.id === modelId);
  if (!model) return null;

  if (usage.costUsd && model.spendUsedUsd != null) {
    model.spendUsedUsd = round2(model.spendUsedUsd + usage.costUsd);
  }
  if (usage.credits && model.creditBalance != null) {
    model.creditBalance = Math.max(0, model.creditBalance - usage.credits);
  }
  save(registry);
  return model;
}

function summary() {
  const registry = load();
  return {
    total: registry.models.length,
    available: registry.models.filter((m) => m.status === 'available').length,
    metered: registry.models.filter((m) => m.status === 'metered').length,
    routes: Object.keys(registry.taskRoutes).length,
  };
}

module.exports = { load, save, all, byId, select, isUsable, estimateCost, recordUsage, summary, REGISTRY_PATH };
