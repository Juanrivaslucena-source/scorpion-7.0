/* =========================================================================
   assets/js/api.js
   Data access layer. Reads the JSON files in /data, caches them, and exposes
   derived metrics to the UI. Also wraps the outbound AI service calls
   (Arena.ai, Fable 5, RunwayML) which run in simulated mode in the browser
   unless real keys are configured in Settings.
   ========================================================================= */
(function (global) {
  'use strict';

  var DATA_FILES = {
    products: 'data/products.json',
    content: 'data/content.json',
    sales: 'data/sales.json',
    tasks: 'data/tasks.json',
    models: 'modules/model-registry/models.json'
  };

  var cache = {};
  var inflight = {};

  function round2(n) { return Math.round(n * 100) / 100; }

  function money(n) {
    var v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function moneyShort(n) {
    var v = Number(n) || 0;
    if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1) + 'k';
    return '$' + v.toFixed(0);
  }

  function compact(n) {
    var v = Number(n) || 0;
    if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(v);
  }

  function relTime(iso) {
    if (!iso) return '—';
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '—';
    var diff = Math.round((Date.now() - then) / 1000);
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.round(diff / 60) + 'm ago';
    if (diff < 86400) return Math.round(diff / 3600) + 'h ago';
    return Math.round(diff / 86400) + 'd ago';
  }

  /** Fetch + cache one JSON file. Falls back to an empty shape on failure. */
  function load(key, opts) {
    opts = opts || {};
    if (!opts.fresh && cache[key]) return Promise.resolve(cache[key]);
    if (inflight[key]) return inflight[key];

    var url = DATA_FILES[key];
    if (!url) return Promise.reject(new Error('Unknown data key: ' + key));

    inflight[key] = fetch(url, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        cache[key] = json;
        delete inflight[key];
        return json;
      })
      .catch(function (err) {
        delete inflight[key];
        console.warn('[api] failed to load', key, err.message);
        cache[key] = emptyShape(key);
        return cache[key];
      });

    return inflight[key];
  }

  function emptyShape(key) {
    switch (key) {
      case 'products': return { products: [], count: 0 };
      case 'content': return { clips: [], count: 0, totals: { views: 0, clicks: 0, published: 0, clickThroughRatePct: 0 } };
      case 'sales': return { currency: 'USD', totals: { revenue: 0, cogs: 0, grossProfit: 0, orders: 0, averageOrderValue: 0, marginPct: 0 }, daily: [], orders: [], byChannel: {} };
      case 'tasks': return { tasks: [], count: 0 };
      case 'models': return { models: [], taskRoutes: {} };
      default: return {};
    }
  }

  /** Load everything the dashboard needs in one shot. */
  function loadAll(fresh) {
    return Promise.all(
      Object.keys(DATA_FILES).map(function (k) { return load(k, { fresh: fresh }); })
    ).then(function (results) {
      var out = {};
      Object.keys(DATA_FILES).forEach(function (k, i) { out[k] = results[i]; });
      return out;
    });
  }

  function invalidate(key) {
    if (key) delete cache[key];
    else cache = {};
  }

  /* ---------- derived metrics ------------------------------------------- */

  /** Revenue for the trailing N days plus the delta vs the prior N days. */
  function revenueWindow(sales, days) {
    var daily = (sales && sales.daily) || [];
    days = days || 7;
    var recent = daily.slice(-days);
    var prior = daily.slice(-days * 2, -days);
    var sum = function (arr) { return arr.reduce(function (s, d) { return s + (d.revenue || 0); }, 0); };
    var a = round2(sum(recent));
    var b = round2(sum(prior));
    var deltaPct = b > 0 ? round2(((a - b) / b) * 100) : (a > 0 ? 100 : 0);
    return { current: a, previous: b, deltaPct: deltaPct, days: days };
  }

  function topProducts(products, sales, limit) {
    var list = (products && products.products) || [];
    var byId = {};
    ((sales && sales.orders) || []).forEach(function (o) {
      if (o.status === 'refunded') return;
      byId[o.productId] = (byId[o.productId] || 0) + o.unitPrice * o.quantity;
    });
    return list
      .map(function (p) { return Object.assign({}, p, { windowRevenue: round2(byId[p.id] || 0) }); })
      .sort(function (a, b) { return b.windowRevenue - a.windowRevenue; })
      .slice(0, limit || 5);
  }

  function clipsForProduct(content, productId) {
    return ((content && content.clips) || []).filter(function (c) { return c.productId === productId; });
  }

  function activeTasks(tasks) {
    return ((tasks && tasks.tasks) || []).filter(function (t) {
      return t.status === 'running' || t.status === 'queued';
    });
  }

  function systemStatus(models, tasks) {
    var list = (models && models.models) || [];
    var runway = list.filter(function (m) { return m.id === 'runway-gen3'; })[0] || {};
    var fable = list.filter(function (m) { return m.id === 'fable-5'; })[0] || {};
    var failed = ((tasks && tasks.tasks) || []).filter(function (t) { return t.status === 'failed'; }).length;
    return {
      modelsOnline: list.filter(function (m) { return m.status === 'available'; }).length,
      modelsTotal: list.length,
      runwayCredits: runway.creditBalance || 0,
      fableSpendUsed: fable.spendUsedUsd || 0,
      fableSpendLimit: fable.spendLimitUsd || 0,
      failedTasks: failed,
      healthy: failed === 0
    };
  }

  /* ---------- outbound AI services --------------------------------------- */

  function getConfig() {
    try { return JSON.parse(localStorage.getItem('scorpion.config') || '{}'); }
    catch (e) { return {}; }
  }

  function setConfig(patch) {
    var next = Object.assign(getConfig(), patch);
    localStorage.setItem('scorpion.config', JSON.stringify(next));
    return next;
  }

  function isDemoMode() {
    var cfg = getConfig();
    return !cfg.arenaKey;
  }

  /**
   * Call an Arena.ai model. In demo mode this resolves with a simulated
   * envelope so the UI stays fully functional with no credentials.
   */
  function callArena(modelId, prompt, opts) {
    opts = opts || {};
    var cfg = getConfig();
    if (!cfg.arenaKey) {
      return simulate({ service: 'arena', model: modelId, prompt: prompt });
    }
    return fetch((cfg.arenaBase || 'https://api.arena.ai/v1') + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + cfg.arenaKey
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: opts.system || 'You are a Scorpion specialist agent. Return JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: opts.temperature != null ? opts.temperature : 0.4
      })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Arena HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        return {
          ok: true,
          simulated: false,
          service: 'arena',
          model: modelId,
          text: (json.choices && json.choices[0] && json.choices[0].message.content) || '',
          raw: json
        };
      });
  }

  /** Dispatch a Fable 5 browser task (metered). */
  function callFable(action, params) {
    var cfg = getConfig();
    if (!cfg.fableKey) {
      return simulate({ service: 'fable', model: 'fable-5', action: action, params: params });
    }
    return fetch((cfg.fableBase || 'https://api.fable.run/v5') + '/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.fableKey },
      body: JSON.stringify({ action: action, params: params })
    }).then(function (r) {
      if (!r.ok) throw new Error('Fable HTTP ' + r.status);
      return r.json();
    }).then(function (json) {
      return { ok: true, simulated: false, service: 'fable', action: action, data: json };
    });
  }

  /** Queue a RunwayML render (metered by credits). */
  function callRunway(clip) {
    var cfg = getConfig();
    if (!cfg.runwayKey) {
      return simulate({ service: 'runway', model: 'runway-gen3', clip: clip });
    }
    return fetch('https://api.runwayml.com/v1/image_to_video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.runwayKey },
      body: JSON.stringify({ promptText: clip.hook, duration: clip.durationSec || 5 })
    }).then(function (r) {
      if (!r.ok) throw new Error('Runway HTTP ' + r.status);
      return r.json();
    }).then(function (json) {
      return { ok: true, simulated: false, service: 'runway', data: json };
    });
  }

  /** Deterministic-ish simulated response with realistic latency. */
  function simulate(payload) {
    var latency = 400 + Math.round(Math.random() * 900);
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve({
          ok: true,
          simulated: true,
          service: payload.service,
          model: payload.model,
          latencyMs: latency,
          text: '[simulated ' + payload.service + ' response]',
          payload: payload
        });
      }, latency);
    });
  }

  global.ScorpionAPI = {
    load: load,
    loadAll: loadAll,
    invalidate: invalidate,
    files: DATA_FILES,
    // formatting
    money: money,
    moneyShort: moneyShort,
    compact: compact,
    relTime: relTime,
    round2: round2,
    // derived
    revenueWindow: revenueWindow,
    topProducts: topProducts,
    clipsForProduct: clipsForProduct,
    activeTasks: activeTasks,
    systemStatus: systemStatus,
    // services
    getConfig: getConfig,
    setConfig: setConfig,
    isDemoMode: isDemoMode,
    callArena: callArena,
    callFable: callFable,
    callRunway: callRunway
  };
})(window);
