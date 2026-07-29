/* =========================================================================
   assets/js/dashboard.js
   All view rendering. Each view exposes skeleton() and render(state).
   ========================================================================= */
(function (global) {
  'use strict';

  var API = global.ScorpionAPI;

  /* ---------- helpers ----------------------------------------------------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function icon(id, cls) {
    return '<svg class="' + (cls || '') + '"><use href="#' + id + '"/></svg>';
  }

  function badge(text, kind) {
    return '<span class="badge badge-' + (kind || 'neutral') + '">' + esc(text) + '</span>';
  }

  function empty(iconId, title, body, actionHtml) {
    return '<div class="empty">' + icon(iconId) +
      '<h3>' + esc(title) + '</h3><p>' + esc(body) + '</p>' + (actionHtml || '') + '</div>';
  }

  function skLines(n, widths) {
    var out = '';
    for (var i = 0; i < n; i++) {
      out += '<div class="skeleton sk-line ' + (widths ? widths[i % widths.length] : 'w80') + '"></div>';
    }
    return out;
  }

  function skCards(n) {
    var out = '';
    for (var i = 0; i < n; i++) {
      out += '<div class="card">' + skLines(1, ['w60']) +
        '<div class="skeleton sk-value"></div>' + skLines(2, ['w80', 'w40']) + '</div>';
    }
    return out;
  }

  function pct(n) { return (Number(n) || 0).toFixed(1) + '%'; }

  function deltaMarkup(deltaPct) {
    var up = deltaPct >= 0;
    var arrow = up ? '▲' : '▼';
    return '<span class="' + (up ? 'up' : 'down') + '">' + arrow + ' ' + Math.abs(deltaPct).toFixed(1) + '%</span>';
  }

  /* ---------- revenue chart ---------------------------------------------- */

  function chart(daily) {
    if (!daily || !daily.length) {
      return empty('i-chart', 'No revenue yet', 'Once orders land, the daily curve renders here.');
    }
    var max = Math.max.apply(null, daily.map(function (d) { return d.revenue; })) || 1;
    var bars = daily.map(function (d, i) {
      var h = Math.max(2, Math.round((d.revenue / max) * 100));
      var label = new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      return '<div class="bar-wrap">' +
        '<div class="tip"><div class="tip-rev">' + API.money(d.revenue) + '</div>' +
        '<div class="tip-date">' + esc(label) + ' · ' + d.orders + ' orders</div></div>' +
        '<div class="bar" style="height:' + h + '%;animation-delay:' + (i * 12) + 'ms"></div>' +
        '</div>';
    }).join('');

    var first = daily[0].date, last = daily[daily.length - 1].date;
    var fmt = function (s) {
      return new Date(s + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    };
    return '<div class="chart">' + bars + '</div>' +
      '<div class="chart-axis"><span>' + fmt(first) + '</span><span>' + fmt(last) + '</span></div>';
  }

  /* ---------- task rows --------------------------------------------------- */

  function taskIconFor(status) {
    if (status === 'running') return { id: 'i-bolt', cls: 'running' };
    if (status === 'done') return { id: 'i-check', cls: 'done' };
    if (status === 'failed') return { id: 'i-alert', cls: 'failed' };
    return { id: 'i-clock', cls: '' };
  }

  function taskRow(t) {
    var ic = taskIconFor(t.status);
    var when = t.completedAt || t.startedAt || t.createdAt;
    var meta = [];
    if (t.assignedModel) meta.push('<code>' + esc(t.assignedModel) + '</code>');
    meta.push(esc(t.status));
    if (when) meta.push(API.relTime(when));
    if (t.error) meta.push('<span style="color:var(--danger)">' + esc(t.error) + '</span>');

    var progress = '';
    if (t.status === 'running' || t.status === 'queued') {
      progress = '<div class="progress"><i style="width:' + (t.progress || 0) + '%"></i></div>';
    } else if (t.status === 'failed') {
      progress = '<div class="progress failed"><i style="width:' + (t.progress || 100) + '%"></i></div>';
    }

    return '<div class="task">' +
      '<div class="task-icon ' + ic.cls + '">' + icon(ic.id) + '</div>' +
      '<div class="task-body">' +
        '<div class="task-title">' + esc(t.title) + '</div>' +
        '<div class="task-meta">' + meta.join('<span style="opacity:.4">·</span>') + '</div>' +
        progress +
      '</div></div>';
  }

  /* ---------- Dashboard view ---------------------------------------------- */

  var dashboard = {
    title: 'Dashboard',
    sub: 'Live operational overview',
    skeleton: function () {
      return '<div class="section"><div class="grid grid-kpi">' + skCards(4) + '</div></div>' +
        '<div class="grid grid-2">' +
        '<div class="card"><div class="skeleton sk-line w40"></div><div class="skeleton sk-chart"></div></div>' +
        '<div class="card">' + skLines(6, ['w80', 'w60', 'w40']) + '</div></div>';
    },
    render: function (s) {
      var sales = s.sales, tasks = s.tasks, content = s.content;
      var win = API.revenueWindow(sales, 7);
      var status = API.systemStatus(s.models, tasks);
      var active = API.activeTasks(tasks);
      var top = API.topProducts(s.products, sales, 4);
      var totals = sales.totals || {};

      var kpis =
        kpi('Revenue · 30d', API.money(totals.revenue), 'i-dollar',
            deltaMarkup(win.deltaPct) + ' <span style="color:var(--text-faint)">vs prior 7d</span>') +
        kpi('Gross profit', API.money(totals.grossProfit), 'i-chart',
            '<span style="color:var(--text-faint)">' + pct(totals.marginPct) + ' margin</span>') +
        kpi('Orders', String(totals.orders || 0), 'i-box',
            '<span style="color:var(--text-faint)">' + API.money(totals.averageOrderValue) + ' AOV</span>') +
        kpi('Content reach', API.compact((content.totals || {}).views), 'i-film',
            '<span style="color:var(--text-faint)">' + pct((content.totals || {}).clickThroughRatePct) + ' CTR</span>');

      var runningCount = active.filter(function (t) { return t.status === 'running'; }).length;
      var queuedCount = active.length - runningCount;
      var activeLabel = runningCount + ' running' + (queuedCount ? ' · ' + queuedCount + ' queued' : '');

      var activeHtml = active.length
        ? active.map(taskRow).join('')
        : empty('i-check', 'No active tasks', 'The orchestrator is idle. Run a cycle to queue work.',
            '<button class="btn btn-primary" data-action="run-cycle">' + icon('i-play') + ' Run cycle</button>');

      var topHtml = top.length
        ? '<div class="table-wrap"><table class="data compact"><thead><tr>' +
            '<th>Product</th><th>Stage</th><th class="num">Revenue</th><th class="num">Margin</th>' +
          '</tr></thead><tbody>' +
          top.map(function (p) {
            return '<tr><td>' + esc(p.name) + '</td><td>' + badge(p.stage, p.stage) + '</td>' +
              '<td class="num">' + API.money(p.windowRevenue) + '</td>' +
              '<td class="num" style="color:var(--accent)">' + pct(p.marginPct) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : empty('i-box', 'No products yet', 'Run the Product Scout to populate your catalog.');

      var statusHtml =
        statusRow('AI models online', status.modelsOnline + ' / ' + status.modelsTotal, status.modelsOnline > 0 ? 'ok' : 'danger') +
        statusRow('RunwayML credits', String(status.runwayCredits), status.runwayCredits > 20 ? 'ok' : 'warn') +
        statusRow('Fable 5 spend', API.money(status.fableSpendUsed) + ' / ' + API.money(status.fableSpendLimit),
                  status.fableSpendUsed < status.fableSpendLimit * 0.8 ? 'ok' : 'warn') +
        statusRow('Failed tasks (30d)', String(status.failedTasks), status.failedTasks === 0 ? 'ok' : 'danger') +
        statusRow('Mode', API.isDemoMode() ? 'Demo (simulated)' : 'Live keys configured', API.isDemoMode() ? 'warn' : 'ok');

      return '<div class="section"><div class="grid grid-kpi">' + kpis + '</div></div>' +

        '<div class="grid grid-2 section">' +
          '<div class="card">' +
            '<div class="card-head"><h2>Revenue overview</h2>' +
              '<span class="spacer"></span>' +
              '<div class="legend"><span><i style="background:var(--accent)"></i>Daily revenue</span></div>' +
            '</div>' + chart(sales.daily) +
          '</div>' +
          '<div class="card">' +
            '<div class="card-head"><h2>Active tasks</h2><span class="spacer"></span>' +
              badge(active.length ? activeLabel : 'idle', active.length ? 'active' : 'neutral') + '</div>' +
            activeHtml +
          '</div>' +
        '</div>' +

        '<div class="grid grid-2">' +
          '<div class="card"><div class="card-head"><h2>Recent products</h2>' +
            '<span class="spacer"></span><button class="btn btn-ghost" data-nav="scout">View all</button></div>' +
            topHtml + '</div>' +
          '<div class="card"><div class="card-head"><h2>System status</h2>' +
            '<span class="spacer"></span>' + badge(status.healthy ? 'healthy' : 'attention', status.healthy ? 'winning' : 'dead') +
            '</div>' + statusHtml + '</div>' +
        '</div>';
    }
  };

  function kpi(label, value, iconId, delta) {
    return '<div class="card card-hover">' +
      '<div class="kpi-label">' + icon(iconId) + esc(label) + '</div>' +
      '<div class="kpi-value">' + esc(value) + '</div>' +
      '<div class="kpi-delta">' + (delta || '') + '</div></div>';
  }

  function statusRow(label, value, tone) {
    var color = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : 'var(--danger)';
    return '<div class="status-row"><span class="dot" style="color:' + color + '"></span>' +
      esc(label) + '<span class="spacer"></span>' +
      '<span style="font-family:var(--mono);font-size:12.5px">' + esc(value) + '</span></div>';
  }

  /* ---------- Product Scout view ------------------------------------------ */

  var scout = {
    title: 'Product Scout',
    sub: 'Sourcing, margin and saturation intelligence',
    skeleton: function () { return '<div class="grid grid-cards">' + skCards(6) + '</div>'; },
    render: function (s) {
      var list = (s.products && s.products.products) || [];
      if (!list.length) {
        return empty('i-search', 'No products scouted yet',
          'Run a scout cycle to find products matching your margin, trend and saturation criteria.',
          '<button class="btn btn-primary" data-action="run-scout">' + icon('i-play') + ' Run scout cycle</button>');
      }

      var order = { winning: 0, active: 1, sourcing: 2, researching: 3, dead: 4 };
      var sorted = list.slice().sort(function (a, b) {
        return (order[a.stage] - order[b.stage]) || (b.scoutScore - a.scoutScore);
      });

      var counts = {};
      list.forEach(function (p) { counts[p.stage] = (counts[p.stage] || 0) + 1; });
      var filterBar = '<div class="section-head"><div class="chip-row">' +
        '<button class="chip" data-filter="all" style="cursor:pointer">All ' + list.length + '</button>' +
        Object.keys(order).filter(function (k) { return counts[k]; }).map(function (k) {
          return '<button class="chip" data-filter="' + k + '" style="cursor:pointer">' + k + ' ' + counts[k] + '</button>';
        }).join('') +
        '</div><span class="spacer"></span>' +
        '<button class="btn btn-primary" data-action="run-scout">' + icon('i-play') + ' Run scout cycle</button></div>';

      var cards = sorted.map(function (p) {
        var clips = API.clipsForProduct(s.content, p.id);
        var sat = (p.saturation || {}).score || 'medium';
        return '<div class="card card-hover product-card" data-stage="' + esc(p.stage) + '">' +
          '<div class="product-top"><div style="min-width:0">' +
            '<div class="product-name">' + esc(p.name) + '</div>' +
            '<div class="product-cat">' + esc(p.category) + '</div>' +
          '</div><span class="spacer" style="margin-left:auto"></span>' + badge(p.stage, p.stage) + '</div>' +

          '<div class="metric-row">' +
            metric('Cost', API.money(p.cost)) +
            metric('Sale', API.money(p.salePrice)) +
            metric('Margin', pct(p.marginPct), true) +
            metric('Units', String((p.metrics || {}).unitsSold || 0)) +
          '</div>' +

          '<div><div class="metric-k" style="margin-bottom:5px">Scout score ' + p.scoutScore + '/100</div>' +
            '<div class="meter"><i style="width:' + p.scoutScore + '%"></i></div></div>' +

          '<div class="chip-row">' +
            '<span class="chip">' + esc((p.trend || {}).hashtag || 'no trend tag') + '</span>' +
            '<span class="chip">' + esc((p.trend || {}).momentum || 'flat') + '</span>' +
            '<span class="badge badge-' + esc(sat) + '">' + esc(sat) + ' saturation</span>' +
          '</div>' +

          '<div style="font-size:12.5px;color:var(--text-dim);line-height:1.55">' +
            esc((p.trend || {}).evidence || '') + '</div>' +

          '<div class="kv" style="border-top:1px solid var(--border);padding-top:11px">' +
            '<span class="k">Supplier</span>' +
            '<span class="v"><a href="' + esc((p.supplier || {}).url || '#') + '" target="_blank" rel="noopener">' +
              esc((p.supplier || {}).platform || '—') + ' ★' + ((p.supplier || {}).sellerRating || '—') + '</a></span>' +
          '</div>' +
          '<div class="kv"><span class="k">Ship window</span><span class="v">' +
            ((p.supplier || {}).shipDaysMin || '?') + '–' + ((p.supplier || {}).shipDaysMax || '?') + ' days</span></div>' +
          '<div class="kv"><span class="k">Clips</span><span class="v">' + clips.length + '</span></div>' +
        '</div>';
      }).join('');

      return filterBar + '<div class="grid grid-cards" id="productGrid">' + cards + '</div>';
    }
  };

  function metric(k, v, accent) {
    return '<div class="metric"><div class="metric-k">' + esc(k) + '</div>' +
      '<div class="metric-v' + (accent ? ' accent' : '') + '">' + esc(v) + '</div></div>';
  }

  /* ---------- Content Studio view ----------------------------------------- */

  var studio = {
    title: 'Content Studio',
    sub: 'Short-form clips, hooks and render queue',
    skeleton: function () { return '<div class="grid grid-cards">' + skCards(6) + '</div>'; },
    render: function (s) {
      var clips = (s.content && s.content.clips) || [];
      if (!clips.length) {
        return empty('i-film', 'No clips yet',
          'Generate hooks and clip templates for an active product to start the content engine.',
          '<button class="btn btn-primary" data-action="run-studio">' + icon('i-play') + ' Generate clips</button>');
      }

      var products = {};
      ((s.products && s.products.products) || []).forEach(function (p) { products[p.id] = p; });
      var totals = s.content.totals || {};

      var kpis =
        kpi('Total views', API.compact(totals.views), 'i-film', '<span style="color:var(--text-faint)">across ' + clips.length + ' clips</span>') +
        kpi('Clicks', API.compact(totals.clicks), 'i-bolt', '<span style="color:var(--text-faint)">' + pct(totals.clickThroughRatePct) + ' CTR</span>') +
        kpi('Published', String(totals.published), 'i-check', '<span style="color:var(--text-faint)">' + (clips.length - totals.published) + ' in pipeline</span>') +
        kpi('Render queue', String(clips.filter(function (c) { return c.status === 'queued' || c.status === 'rendering'; }).length),
            'i-clock', '<span style="color:var(--text-faint)">RunwayML Gen-3</span>');

      var order = { published: 0, rendering: 1, queued: 2, draft: 3, archived: 4 };
      var sorted = clips.slice().sort(function (a, b) {
        return (order[a.status] - order[b.status]) || ((b.metrics || {}).views || 0) - ((a.metrics || {}).views || 0);
      });

      var cards = sorted.map(function (c) {
        var p = products[c.productId] || {};
        var m = c.metrics || {};
        var kind = c.status === 'published' ? 'winning' : c.status === 'archived' ? 'dead'
          : c.status === 'draft' ? 'neutral' : 'sourcing';
        return '<div class="card card-hover product-card">' +
          '<div class="product-top"><div style="min-width:0">' +
            '<div class="product-name">“' + esc(c.hook) + '”</div>' +
            '<div class="product-cat">' + esc(p.name || c.productId) + ' · ' + esc(c.platform) + '</div>' +
          '</div><span class="spacer" style="margin-left:auto"></span>' + badge(c.status, kind) + '</div>' +

          '<div class="metric-row">' +
            metric('Views', API.compact(m.views || 0)) +
            metric('Likes', API.compact(m.likes || 0)) +
            metric('Clicks', API.compact(m.clicks || 0)) +
            metric('CVR', pct(m.conversionRatePct || 0), true) +
          '</div>' +

          '<div style="font-size:12.5px;color:var(--text-dim)">' +
            (c.script || []).map(function (b) {
              return '<div style="display:flex;gap:9px;padding:3px 0">' +
                '<code style="font-family:var(--mono);font-size:11px;color:var(--text-faint);flex:0 0 46px">' + esc(b.t) + '</code>' +
                '<span>' + esc(b.shot) + '</span></div>';
            }).join('') +
          '</div>' +

          '<div class="chip-row">' + (c.hashtags || []).map(function (h) {
            return '<span class="chip">' + esc(h) + '</span>';
          }).join('') + '</div>' +

          '<div class="kv" style="border-top:1px solid var(--border);padding-top:11px">' +
            '<span class="k">Format</span><span class="v">' + esc(c.format) + '</span></div>' +
          '<div class="kv"><span class="k">Engine</span><span class="v">' + esc(c.renderEngine) +
            (c.runwayCreditsUsed ? ' · ' + c.runwayCreditsUsed + ' cr' : '') + '</span></div>' +
        '</div>';
      }).join('');

      return '<div class="section"><div class="grid grid-kpi">' + kpis + '</div></div>' +
        '<div class="section-head"><h2>Clip library</h2><span class="spacer"></span>' +
        '<button class="btn btn-primary" data-action="run-studio">' + icon('i-play') + ' Generate clips</button></div>' +
        '<div class="grid grid-cards">' + cards + '</div>';
    }
  };

  /* ---------- Sales Tracker view ------------------------------------------ */

  var salesView = {
    title: 'Sales Tracker',
    sub: 'Orders, channels and unit economics',
    skeleton: function () {
      return '<div class="grid grid-kpi section">' + skCards(4) + '</div>' +
        '<div class="card">' + skLines(10, ['w80', 'w60', 'w40']) + '</div>';
    },
    render: function (s) {
      var sales = s.sales || {};
      var orders = sales.orders || [];
      if (!orders.length) {
        return empty('i-chart', 'No sales recorded',
          'Connect Shopify or TikTok Shop, or run the tracker ingest to import orders.');
      }

      var t = sales.totals || {};
      var products = {};
      ((s.products && s.products.products) || []).forEach(function (p) { products[p.id] = p; });

      var kpis =
        kpi('Revenue', API.money(t.revenue), 'i-dollar', '<span style="color:var(--text-faint)">' + sales.periodStart + ' → ' + sales.periodEnd + '</span>') +
        kpi('COGS', API.money(t.cogs), 'i-box', '<span style="color:var(--text-faint)">landed cost</span>') +
        kpi('Gross profit', API.money(t.grossProfit), 'i-chart', '<span class="up">' + pct(t.marginPct) + ' margin</span>') +
        kpi('AOV', API.money(t.averageOrderValue), 'i-bolt', '<span style="color:var(--text-faint)">' + t.orders + ' paid orders</span>');

      var channels = sales.byChannel || {};
      var chanTotal = Object.keys(channels).reduce(function (sum, k) { return sum + channels[k].revenue; }, 0) || 1;
      var chanHtml = Object.keys(channels).map(function (k) {
        var c = channels[k];
        var share = (c.revenue / chanTotal) * 100;
        return '<div style="margin-bottom:14px">' +
          '<div style="display:flex;font-size:13px;margin-bottom:6px">' +
            '<span>' + esc(k) + '</span><span class="spacer" style="margin-left:auto"></span>' +
            '<span style="font-family:var(--mono);font-size:12.5px">' + API.money(c.revenue) + ' · ' + c.orders + '</span></div>' +
          '<div class="meter"><i style="width:' + share.toFixed(1) + '%"></i></div></div>';
      }).join('');

      var recent = orders.slice(-14).reverse();
      var rows = recent.map(function (o) {
        var p = products[o.productId] || {};
        var tone = o.status === 'refunded' ? 'dead' : o.status === 'delivered' ? 'winning' : 'active';
        return '<tr><td style="font-family:var(--mono);font-size:12px;color:var(--text-faint)">' + esc(o.id) + '</td>' +
          '<td>' + esc(o.date) + '</td>' +
          '<td>' + esc(p.name || o.productId) + '</td>' +
          '<td>' + esc(o.channel) + '</td>' +
          '<td class="num">' + o.quantity + '</td>' +
          '<td class="num">' + API.money(o.unitPrice * o.quantity) + '</td>' +
          '<td>' + badge(o.status, tone) + '</td></tr>';
      }).join('');

      return '<div class="section"><div class="grid grid-kpi">' + kpis + '</div></div>' +
        '<div class="grid grid-2 section">' +
          '<div class="card"><div class="card-head"><h2>Daily revenue</h2></div>' + chart(sales.daily) + '</div>' +
          '<div class="card"><div class="card-head"><h2>Channel split</h2></div>' + chanHtml + '</div>' +
        '</div>' +
        '<div class="card"><div class="card-head"><h2>Recent orders</h2><span class="spacer"></span>' +
          '<span style="font-size:12px;color:var(--text-faint)">last 14 of ' + orders.length + '</span></div>' +
          '<div class="table-wrap"><table class="data"><thead><tr>' +
          '<th>Order</th><th>Date</th><th>Product</th><th>Channel</th><th class="num">Qty</th><th class="num">Total</th><th>Status</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    }
  };

  /* ---------- Model Registry view ----------------------------------------- */

  var models = {
    title: 'Model Registry',
    sub: 'Available specialists and routing policy',
    skeleton: function () { return '<div class="grid grid-cards">' + skCards(6) + '</div>'; },
    render: function (s) {
      var list = (s.models && s.models.models) || [];
      if (!list.length) return empty('i-cpu', 'Registry empty', 'No models are registered for routing.');

      var routes = (s.models && s.models.taskRoutes) || {};
      var cards = list.map(function (m) {
        var tone = m.status === 'available' ? 'winning' : m.status === 'metered' ? 'sourcing' : 'dead';
        var cost = m.costPer1kTokensUsd != null ? '$' + m.costPer1kTokensUsd.toFixed(4) + ' / 1k tok'
          : m.costPerRunUsd != null ? '$' + m.costPerRunUsd.toFixed(2) + ' / run'
          : m.creditsPerSecond != null ? m.creditsPerSecond + ' credits / sec' : '—';
        return '<div class="card card-hover product-card">' +
          '<div class="product-top"><div style="min-width:0">' +
            '<div class="product-name">' + esc(m.label) + '</div>' +
            '<div class="product-cat">' + esc(m.vendor) + ' · ' + esc(m.provider) + '</div>' +
          '</div><span class="spacer" style="margin-left:auto"></span>' + badge(m.status, tone) + '</div>' +
          '<div style="font-size:12.5px;color:var(--text-dim);line-height:1.55">' + esc(m.strengths || '') + '</div>' +
          '<div class="chip-row">' + (m.capabilities || []).map(function (c) {
            return '<span class="chip">' + esc(c) + '</span>';
          }).join('') + '</div>' +
          '<div class="kv" style="border-top:1px solid var(--border);padding-top:11px">' +
            '<span class="k">Cost</span><span class="v">' + esc(cost) + '</span></div>' +
          (m.quality != null ? '<div class="kv"><span class="k">Quality index</span><span class="v">' + m.quality.toFixed(2) + '</span></div>' : '') +
          (m.latencyMs != null ? '<div class="kv"><span class="k">Typical latency</span><span class="v">' + (m.latencyMs / 1000).toFixed(1) + 's</span></div>' : '') +
          (m.creditBalance != null ? '<div class="kv"><span class="k">Credits left</span><span class="v">' + m.creditBalance + '</span></div>' : '') +
          (m.spendLimitUsd != null ? '<div class="kv"><span class="k">Spend</span><span class="v">' + API.money(m.spendUsedUsd || 0) + ' / ' + API.money(m.spendLimitUsd) + '</span></div>' : '') +
        '</div>';
      }).join('');

      var routeRows = Object.keys(routes).map(function (k) {
        var r = routes[k];
        return '<tr><td>' + esc(k) + '</td>' +
          '<td><code style="font-family:var(--mono);font-size:12px;color:var(--accent)">' + esc(r.primary || '—') + '</code></td>' +
          '<td><code style="font-family:var(--mono);font-size:12px;color:var(--text-dim)">' + esc(r.fallback || '—') + '</code></td>' +
          '<td><code style="font-family:var(--mono);font-size:12px;color:var(--warn)">' + esc(r.escalate || '—') + '</code></td></tr>';
      }).join('');

      return '<div class="grid grid-cards section">' + cards + '</div>' +
        '<div class="card"><div class="card-head"><h2>Task routing table</h2></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr>' +
        '<th>Task type</th><th>Primary</th><th>Fallback</th><th>Escalation</th>' +
        '</tr></thead><tbody>' + routeRows + '</tbody></table></div></div>';
    }
  };

  /* ---------- Settings view ----------------------------------------------- */

  var settings = {
    title: 'Settings',
    sub: 'Credentials, routing policy and session',
    skeleton: function () { return '<div class="grid grid-2">' + skCards(2) + '</div>'; },
    render: function (s) {
      var cfg = API.getConfig();
      var session = global.ScorpionAuth.getSession() || {};
      var policy = (s.models && s.models.routingPolicy) || {};

      var keysCard = '<div class="card"><div class="card-head"><h2>API credentials</h2>' +
        '<span class="spacer"></span>' + badge(API.isDemoMode() ? 'demo mode' : 'live', API.isDemoMode() ? 'sourcing' : 'winning') + '</div>' +
        '<p style="font-size:12.5px;color:var(--text-dim);margin:0 0 16px">' +
          'Keys are stored in this browser\'s localStorage only. Leave blank to keep every service simulated.</p>' +
        field('arenaKey', 'Arena.ai API key', cfg.arenaKey, 'password', 'Routes all specialist model calls.') +
        field('fableKey', 'Fable 5 API key', cfg.fableKey, 'password', 'Browser agent for live scraping. Metered.') +
        field('runwayKey', 'RunwayML API key', cfg.runwayKey, 'password', '125 credits in the current pool.') +
        '<button class="btn btn-primary" data-action="save-keys">Save credentials</button> ' +
        '<button class="btn btn-ghost" data-action="clear-keys">Clear all</button></div>';

      var oauthCard = '<div class="card"><div class="card-head"><h2>GitHub OAuth</h2></div>' +
        '<p style="font-size:12.5px;color:var(--text-dim);margin:0 0 16px">' +
          'Register an OAuth app with callback <code style="font-family:var(--mono);font-size:11.5px">' +
          esc(global.ScorpionAuth.callbackUrl()) + '</code></p>' +
        field('githubClientId', 'Client ID', cfg.githubClientId, 'text', 'Public identifier for your OAuth app.') +
        field('tokenExchangeUrl', 'Token exchange endpoint', cfg.tokenExchangeUrl, 'text',
          'Server-side URL that swaps the code for a token (the client secret must never ship to the browser).') +
        '<button class="btn btn-primary" data-action="save-oauth">Save OAuth config</button></div>';

      var sessionCard = '<div class="card"><div class="card-head"><h2>Session</h2></div>' +
        '<div class="kv"><span class="k">Mode</span><span class="v">' + esc(session.mode || 'none') + '</span></div>' +
        '<div class="kv"><span class="k">User</span><span class="v">' + esc((session.user || {}).login || '—') + '</span></div>' +
        '<div class="kv"><span class="k">Started</span><span class="v">' + API.relTime(session.createdAt ? new Date(session.createdAt).toISOString() : null) + '</span></div>' +
        '<div class="kv"><span class="k">Expires</span><span class="v">' +
          (session.expiresAt ? new Date(session.expiresAt).toLocaleString() : '—') + '</span></div>' +
        '<div style="margin-top:16px"><button class="btn btn-ghost" data-action="logout">Sign out</button></div></div>';

      var policyCard = '<div class="card"><div class="card-head"><h2>Routing policy</h2></div>' +
        '<div class="kv"><span class="k">Strategy</span><span class="v">' + esc(policy.strategy || '—') + '</span></div>' +
        '<div class="kv"><span class="k">Fallback model</span><span class="v">' + esc(policy.fallbackModel || '—') + '</span></div>' +
        '<div class="kv"><span class="k">Max retries</span><span class="v">' + (policy.maxRetries != null ? policy.maxRetries : '—') + '</span></div>' +
        '<div class="kv"><span class="k">Cost ceiling / task</span><span class="v">' + API.money(policy.costCeilingUsdPerTask || 0) + '</span></div>' +
        '<p style="font-size:12px;color:var(--text-faint);margin:14px 0 0">' +
          'Edit modules/model-registry/models.json to change routing.</p></div>';

      return '<div class="grid grid-2">' + keysCard + oauthCard + sessionCard + policyCard + '</div>';
    }
  };

  function field(id, label, value, type, hint) {
    return '<div class="field"><label for="f_' + id + '">' + esc(label) + '</label>' +
      '<input id="f_' + id + '" data-key="' + id + '" type="' + type + '" value="' + esc(value || '') + '" ' +
      'autocomplete="off" spellcheck="false" />' +
      (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
  }

  global.ScorpionViews = {
    dashboard: dashboard,
    scout: scout,
    studio: studio,
    sales: salesView,
    models: models,
    settings: settings,
    helpers: { esc: esc, icon: icon, badge: badge, empty: empty, chart: chart, taskRow: taskRow, kpi: kpi }
  };
})(window);
