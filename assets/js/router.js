/* =========================================================================
   assets/js/router.js
   AI model task router.

   Accepts a task type, consults modules/model-registry/models.json for the
   best available model, enforces the cost ceiling, queues the task, executes
   it (through ScorpionAPI's service wrappers) and returns a structured result.
   ========================================================================= */
(function (global) {
  'use strict';

  var API = global.ScorpionAPI;

  var registry = null;
  var queue = [];
  var history = [];
  var listeners = [];
  var running = false;
  var seq = 0;

  function init(models) {
    registry = models;
    return registry;
  }

  function ensureRegistry() {
    if (registry) return Promise.resolve(registry);
    return API.load('models').then(init);
  }

  function on(fn) {
    listeners.push(fn);
    return function off() { listeners = listeners.filter(function (l) { return l !== fn; }); };
  }

  function emit(event, payload) {
    listeners.forEach(function (fn) {
      try { fn(event, payload); } catch (e) { console.error('[router] listener error', e); }
    });
  }

  function modelById(id) {
    return ((registry && registry.models) || []).filter(function (m) { return m.id === id; })[0] || null;
  }

  function isUsable(model) {
    if (!model) return false;
    if (model.status === 'offline' || model.status === 'disabled') return false;
    if (model.id === 'fable-5' && model.spendLimitUsd != null) {
      if ((model.spendUsedUsd || 0) >= model.spendLimitUsd) return false;
    }
    if (model.id === 'runway-gen3' && (model.creditBalance || 0) <= 0) return false;
    return true;
  }

  function estimateCost(model, task) {
    if (!model) return 0;
    if (model.costPerRunUsd) return model.costPerRunUsd;
    if (model.creditsPerSecond) {
      var secs = (task.payload && task.payload.durationSec) || 5;
      return API.round2(model.creditsPerSecond * secs * 0.01);
    }
    var kTokens = (task.estimatedTokens || 1500) / 1000;
    return API.round2((model.costPer1kTokensUsd || 0) * kTokens);
  }

  /**
   * Choose a model for a task type.
   * Order: explicit override → route primary → route fallback → capability
   * match → global fallback. Cost ceiling filters candidates.
   */
  function selectModel(taskType, opts) {
    opts = opts || {};
    var routes = (registry && registry.taskRoutes) || {};
    var policy = (registry && registry.routingPolicy) || {};
    var ceiling = opts.costCeilingUsd != null ? opts.costCeilingUsd : policy.costCeilingUsdPerTask;

    var candidates = [];
    if (opts.model) candidates.push(opts.model);
    var route = routes[taskType];
    if (route) {
      if (opts.escalate && route.escalate) candidates.push(route.escalate);
      if (route.primary) candidates.push(route.primary);
      if (route.fallback) candidates.push(route.fallback);
    }

    // capability match as a safety net
    ((registry && registry.models) || []).forEach(function (m) {
      if ((m.capabilities || []).indexOf(taskType) !== -1) candidates.push(m.id);
    });
    if (policy.fallbackModel) candidates.push(policy.fallbackModel);

    var seen = {};
    for (var i = 0; i < candidates.length; i++) {
      var id = candidates[i];
      if (seen[id]) continue;
      seen[id] = true;
      var m = modelById(id);
      if (!isUsable(m)) continue;
      var cost = estimateCost(m, { type: taskType, payload: opts.payload });
      if (ceiling != null && cost > ceiling && !opts.model) continue;
      return { model: m, estimatedCostUsd: cost, reason: reasonFor(id, route, opts) };
    }
    return null;
  }

  function reasonFor(id, route, opts) {
    if (opts.model === id) return 'explicit override';
    if (route && route.escalate === id && opts.escalate) return 'escalated to live browser agent';
    if (route && route.primary === id) return 'primary route for task type';
    if (route && route.fallback === id) return 'primary unavailable, using fallback';
    return 'capability match';
  }

  /** Queue a task. Returns the task record immediately. */
  function enqueue(taskType, payload, opts) {
    opts = opts || {};
    var task = {
      id: 'tsk_' + Date.now().toString(36) + (++seq),
      type: taskType,
      title: opts.title || humanize(taskType),
      status: 'queued',
      payload: payload || {},
      assignedModel: null,
      estimatedCostUsd: 0,
      progress: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      log: [],
      opts: opts
    };
    queue.push(task);
    emit('queued', task);
    drain();
    return task;
  }

  function humanize(type) {
    return String(type).replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function log(task, msg) {
    task.log.push({ t: new Date().toISOString(), msg: msg });
    emit('log', task);
  }

  /** Process the queue serially so progress is observable in the UI. */
  function drain() {
    if (running) return;
    var next = queue.filter(function (t) { return t.status === 'queued'; })[0];
    if (!next) return;

    running = true;
    ensureRegistry()
      .then(function () { return execute(next); })
      .catch(function (err) {
        next.status = 'failed';
        next.error = err.message;
        next.completedAt = new Date().toISOString();
        emit('failed', next);
      })
      .then(function () {
        running = false;
        history.push(next);
        drain();
      });
  }

  function execute(task) {
    var choice = selectModel(task.type, task.opts);
    if (!choice) {
      throw new Error('No usable model for task type "' + task.type + '" within budget.');
    }

    task.assignedModel = choice.model.id;
    task.estimatedCostUsd = choice.estimatedCostUsd;
    task.status = 'running';
    task.startedAt = new Date().toISOString();
    log(task, 'Routed to ' + choice.model.label + ' (' + choice.reason + ')');
    emit('started', task);

    var ticker = setInterval(function () {
      task.progress = Math.min(95, task.progress + 7 + Math.round(Math.random() * 9));
      emit('progress', task);
    }, 420);

    return dispatch(task, choice.model)
      .then(function (result) {
        clearInterval(ticker);
        task.progress = 100;
        task.status = 'done';
        task.result = result;
        task.simulated = !!result.simulated;
        task.completedAt = new Date().toISOString();
        log(task, 'Completed via ' + choice.model.label + (result.simulated ? ' (simulated)' : ''));
        emit('done', task);
        return task;
      })
      .catch(function (err) {
        clearInterval(ticker);
        task.status = 'failed';
        task.error = err.message;
        task.completedAt = new Date().toISOString();
        log(task, 'FAILED: ' + err.message);
        emit('failed', task);
        return task;
      });
  }

  /** Route the actual call to the right service wrapper. */
  function dispatch(task, model) {
    if (model.provider === 'fable') {
      return API.callFable(task.type, task.payload);
    }
    if (model.provider === 'runway') {
      return API.callRunway(task.payload);
    }
    return API.callArena(model.id, buildPrompt(task), { system: systemFor(task.type) });
  }

  function systemFor(taskType) {
    var map = {
      'trend-research': 'You are a trend research specialist. Return JSON with fields: items[] {name, evidence, momentum, source}.',
      'margin-analysis': 'You are a unit-economics analyst. Return JSON: {cost, salePrice, marginPct, breakEvenUnits, verdict}.',
      'saturation-check': 'You are a competitive analyst. Return JSON: {score, activeSellers, evidence}.',
      'hook-generation': 'You write short-form video hooks. Return JSON: {hooks: [string]}. Each hook must land in under 3 seconds.',
      'listing-copy': 'You write high-converting product listings. Return JSON: {title, bullets[], description}.'
    };
    return map[taskType] || 'You are a Scorpion specialist agent. Return JSON only.';
  }

  function buildPrompt(task) {
    return 'Task: ' + task.type + '\nPayload: ' + JSON.stringify(task.payload, null, 2);
  }

  /** Fire-and-await convenience wrapper. */
  function run(taskType, payload, opts) {
    var task = enqueue(taskType, payload, opts);
    return new Promise(function (resolve) {
      var off = on(function (event, t) {
        if (t.id !== task.id) return;
        if (event === 'done' || event === 'failed') { off(); resolve(t); }
      });
    });
  }

  function getQueue() { return queue.slice(); }
  function getHistory() { return history.slice(); }
  function clearCompleted() {
    queue = queue.filter(function (t) { return t.status === 'queued' || t.status === 'running'; });
    emit('cleared', null);
  }

  global.ScorpionRouter = {
    init: init,
    on: on,
    selectModel: selectModel,
    estimateCost: estimateCost,
    enqueue: enqueue,
    run: run,
    getQueue: getQueue,
    getHistory: getHistory,
    clearCompleted: clearCompleted,
    modelById: modelById
  };
})(window);
