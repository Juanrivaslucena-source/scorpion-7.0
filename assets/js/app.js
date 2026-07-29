/* =========================================================================
   assets/js/app.js
   Boot sequence, view switching, event delegation and live task updates.
   ========================================================================= */
(function (global) {
  'use strict';

  var API = global.ScorpionAPI;
  var Auth = global.ScorpionAuth;
  var Router = global.ScorpionRouter;
  var Views = global.ScorpionViews;

  var state = null;
  var currentView = 'dashboard';
  var liveTasks = [];

  // Routable views only — ScorpionViews also exports a `helpers` bag.
  var VIEWS = ['dashboard', 'scout', 'studio', 'sales', 'models', 'settings'];
  function isView(name) { return VIEWS.indexOf(name) !== -1; }

  var el = {
    login: document.getElementById('loginScreen'),
    loginError: document.getElementById('loginError'),
    app: document.getElementById('app'),
    sidebar: document.getElementById('sidebar'),
    scrim: document.getElementById('scrim'),
    nav: document.getElementById('nav'),
    title: document.getElementById('viewTitle'),
    sub: document.getElementById('viewSub'),
    toasts: document.getElementById('toastHost')
  };

  /* ---------- toasts ------------------------------------------------------ */

  function toast(msg, isError) {
    var node = document.createElement('div');
    node.className = 'toast' + (isError ? ' err' : '');
    node.textContent = msg;
    el.toasts.appendChild(node);
    setTimeout(function () {
      node.style.opacity = '0';
      node.style.transition = 'opacity 200ms ease';
      setTimeout(function () { node.remove(); }, 220);
    }, 3600);
  }

  /* ---------- auth gate --------------------------------------------------- */

  function showLogin(message) {
    el.login.style.display = 'grid';
    el.app.classList.remove('ready');
    if (message) {
      el.loginError.textContent = message;
      el.loginError.classList.add('show');
    }
  }

  function hideLogin() {
    el.login.style.display = 'none';
    el.app.classList.add('ready');
  }

  function paintUser() {
    var s = Auth.getSession();
    if (!s) return;
    var u = s.user || {};
    document.getElementById('userName').textContent = u.name || u.login || 'operator';
    document.getElementById('userRole').textContent = s.mode === 'demo' ? 'Demo operator' : (u.role || 'Director');
    var img = document.getElementById('userAvatar');
    var fallback = document.getElementById('userInitial');
    if (u.avatar_url) {
      img.src = u.avatar_url;
      img.hidden = false;
      fallback.style.display = 'none';
    } else {
      img.hidden = true;
      fallback.style.display = 'grid';
      fallback.textContent = (u.name || u.login || 'S').charAt(0).toUpperCase();
    }
  }

  /* ---------- view switching ---------------------------------------------- */

  function viewNode(name) { return document.getElementById('view-' + name); }

  function setView(name, opts) {
    opts = opts || {};
    if (!isView(name)) name = 'dashboard';
    currentView = name;

    Array.prototype.forEach.call(el.nav.querySelectorAll('.nav-item'), function (b) {
      b.classList.toggle('active', b.dataset.view === name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.classList.toggle('active', v.id === 'view-' + name);
    });

    var view = Views[name];
    el.title.textContent = view.title;
    el.sub.textContent = view.sub;
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);

    var node = viewNode(name);
    if (!state) {
      node.innerHTML = view.skeleton();
      return;
    }
    if (opts.skeletonFirst) {
      node.innerHTML = view.skeleton();
      setTimeout(function () { node.innerHTML = view.render(state); }, 160);
    } else {
      node.innerHTML = view.render(state);
    }
    closeSidebar();
  }

  function repaint() {
    if (!state) return;
    var node = viewNode(currentView);
    node.innerHTML = Views[currentView].render(state);
  }

  /* ---------- data loading ------------------------------------------------ */

  function boot(fresh) {
    VIEWS.forEach(function (k) {
      var n = viewNode(k);
      if (n && !n.innerHTML) n.innerHTML = Views[k].skeleton();
    });

    return API.loadAll(fresh).then(function (data) {
      state = data;
      Router.init(data.models);
      mergeLiveTasks();
      updateNavCounts();
      setView(currentView);
      return data;
    }).catch(function (err) {
      console.error(err);
      toast('Failed to load data: ' + err.message, true);
    });
  }

  function updateNavCounts() {
    var p = ((state.products || {}).products || []).length;
    var c = ((state.content || {}).clips || []).length;
    var m = ((state.models || {}).models || []).length;
    document.getElementById('navProducts').textContent = p;
    document.getElementById('navClips').textContent = c;
    document.getElementById('navModels').textContent = m;
  }

  /** Fold router-generated tasks into the persisted task list for display. */
  function mergeLiveTasks() {
    if (!state || !state.tasks) return;
    var persisted = (state.tasks.tasks || []).filter(function (t) {
      return !liveTasks.some(function (l) { return l.id === t.id; });
    });
    state.tasks = Object.assign({}, state.tasks, { tasks: liveTasks.concat(persisted) });
  }

  /* ---------- orchestration triggers -------------------------------------- */

  function runCycle() {
    toast('Orchestration cycle started');
    queueTask('product-scout', { niche: 'auto-select', maxCandidates: 3 }, 'Product Scout — auto cycle');
    setTimeout(function () {
      queueTask('hook-generation', { productId: 'prd_grout01', count: 5 }, 'Hook batch — grout pen');
    }, 500);
    setTimeout(function () {
      queueTask('sales-analysis', { window: 7 }, 'Weekly revenue analysis');
    }, 1000);
  }

  function queueTask(type, payload, title) {
    var task = Router.enqueue(type, payload, { title: title });
    liveTasks.unshift(task);
    mergeLiveTasks();
    if (currentView === 'dashboard') repaint();
    return task;
  }

  Router.on(function (event, task) {
    if (!task) return;
    var idx = liveTasks.findIndex(function (t) { return t.id === task.id; });
    if (idx >= 0) liveTasks[idx] = task;
    mergeLiveTasks();
    if (currentView === 'dashboard') repaint();
    if (event === 'done') toast('✓ ' + task.title);
    if (event === 'failed') toast('✕ ' + task.title + ' — ' + task.error, true);
  });

  /* ---------- global event delegation ------------------------------------- */

  document.addEventListener('click', function (e) {
    var navBtn = e.target.closest('.nav-item');
    if (navBtn && navBtn.dataset.view) { setView(navBtn.dataset.view, { skeletonFirst: true }); return; }

    var jump = e.target.closest('[data-nav]');
    if (jump) { setView(jump.dataset.nav, { skeletonFirst: true }); return; }

    var filter = e.target.closest('[data-filter]');
    if (filter) {
      var want = filter.dataset.filter;
      Array.prototype.forEach.call(document.querySelectorAll('#productGrid .product-card'), function (card) {
        card.style.display = (want === 'all' || card.dataset.stage === want) ? '' : 'none';
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (b) {
        b.style.borderColor = b === filter ? 'var(--accent-line)' : '';
        b.style.color = b === filter ? 'var(--accent)' : '';
      });
      return;
    }

    var action = e.target.closest('[data-action]');
    if (!action) return;

    switch (action.dataset.action) {
      case 'run-cycle':
        runCycle();
        break;
      case 'run-scout':
        queueTask('product-scout', { niche: 'auto-select', maxCandidates: 3 }, 'Product Scout — manual run');
        toast('Scout cycle queued');
        setView('dashboard', { skeletonFirst: false });
        break;
      case 'run-studio':
        queueTask('hook-generation', { productId: 'prd_ledmask', count: 5 }, 'Hook batch — LED mask');
        toast('Content generation queued');
        setView('dashboard', { skeletonFirst: false });
        break;
      case 'save-keys':
        API.setConfig({
          arenaKey: val('f_arenaKey'),
          fableKey: val('f_fableKey'),
          runwayKey: val('f_runwayKey')
        });
        toast('Credentials saved to this browser');
        repaint();
        break;
      case 'clear-keys':
        localStorage.removeItem('scorpion.config');
        toast('All stored credentials cleared');
        repaint();
        break;
      case 'save-oauth':
        API.setConfig({
          githubClientId: val('f_githubClientId'),
          tokenExchangeUrl: val('f_tokenExchangeUrl')
        });
        toast('OAuth configuration saved');
        repaint();
        break;
      case 'logout':
        Auth.logout();
        break;
    }
  });

  function val(id) {
    var node = document.getElementById(id);
    return node ? node.value.trim() : '';
  }

  /* ---------- chrome ------------------------------------------------------ */

  function openSidebar() { el.sidebar.classList.add('open'); el.scrim.classList.add('show'); }
  function closeSidebar() { el.sidebar.classList.remove('open'); el.scrim.classList.remove('show'); }

  document.getElementById('menuToggle').addEventListener('click', function () {
    el.sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  el.scrim.addEventListener('click', closeSidebar);

  document.getElementById('btnRefresh').addEventListener('click', function () {
    API.invalidate();
    setView(currentView, { skeletonFirst: true });
    boot(true).then(function () { toast('Data refreshed'); });
  });

  document.getElementById('btnRunCycle').addEventListener('click', runCycle);
  document.getElementById('btnLogout').addEventListener('click', Auth.logout);

  document.getElementById('btnLogin').addEventListener('click', function () {
    try { Auth.login(); }
    catch (err) { showLogin(err.message); }
  });

  document.getElementById('btnDemo').addEventListener('click', function () {
    Auth.loginDemo();
    start();
  });

  window.addEventListener('hashchange', function () {
    var name = location.hash.slice(1);
    if (isView(name) && name !== currentView) setView(name, { skeletonFirst: true });
  });

  /* ---------- start ------------------------------------------------------- */

  function start() {
    if (!Auth.isAuthenticated()) { showLogin(); return; }
    hideLogin();
    paintUser();
    var initial = location.hash.slice(1);
    if (isView(initial)) currentView = initial;
    boot(false);
  }

  start();
  global.Scorpion = { boot: boot, setView: setView, state: function () { return state; }, toast: toast };
})(window);
