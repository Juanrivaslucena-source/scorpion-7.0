/* =========================================================================
   assets/js/auth.js
   GitHub OAuth (web application flow) + demo session fallback.

   The browser half of OAuth is implemented here: we build the authorize URL,
   carry an anti-forgery `state` value, and hand the returned ?code to a token
   exchange endpoint. GitHub requires the client_secret for that exchange, so
   it must happen server-side — configure `tokenExchangeUrl` in Settings to
   point at your own function (see pipeline/PIPELINE.md).

   With no OAuth app configured, "Explore demo mode" issues a local session so
   the whole console remains usable.
   ========================================================================= */
(function (global) {
  'use strict';

  var SESSION_KEY = 'scorpion.session';
  var STATE_KEY = 'scorpion.oauth.state';
  var RETURN_KEY = 'scorpion.oauth.return';

  var DEFAULTS = {
    clientId: '',                               // set in Settings → GitHub OAuth
    scope: 'read:user',
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenExchangeUrl: '',                       // your serverless exchange endpoint
    apiBase: 'https://api.github.com'
  };

  function config() {
    var cfg = (global.ScorpionAPI && global.ScorpionAPI.getConfig()) || {};
    return {
      clientId: cfg.githubClientId || DEFAULTS.clientId,
      scope: cfg.githubScope || DEFAULTS.scope,
      authorizeUrl: DEFAULTS.authorizeUrl,
      tokenExchangeUrl: cfg.tokenExchangeUrl || DEFAULTS.tokenExchangeUrl,
      apiBase: DEFAULTS.apiBase
    };
  }

  function getSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s.expiresAt && Date.now() > s.expiresAt) { clearSession(); return null; }
      return s;
    } catch (e) { return null; }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(STATE_KEY);
  }

  function isAuthenticated() { return !!getSession(); }

  function randomState() {
    var bytes = new Uint8Array(16);
    (global.crypto || global.msCrypto).getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function callbackUrl() {
    var base = location.origin + location.pathname.replace(/\/[^/]*$/, '/');
    return base + 'auth/callback.html';
  }

  /** Kick off the GitHub authorize redirect. */
  function login() {
    var cfg = config();
    if (!cfg.clientId) {
      var err = new Error('No GitHub OAuth client ID configured. Add one in Settings, or use demo mode.');
      err.code = 'NO_CLIENT_ID';
      throw err;
    }
    var state = randomState();
    sessionStorage.setItem(STATE_KEY, state);
    sessionStorage.setItem(RETURN_KEY, location.href);

    var url = cfg.authorizeUrl +
      '?client_id=' + encodeURIComponent(cfg.clientId) +
      '&redirect_uri=' + encodeURIComponent(callbackUrl()) +
      '&scope=' + encodeURIComponent(cfg.scope) +
      '&state=' + encodeURIComponent(state);

    location.assign(url);
  }

  /** Start a local demo session (no network, no OAuth app needed). */
  function loginDemo() {
    return setSession({
      mode: 'demo',
      token: null,
      user: { login: 'director', name: 'Director', avatar_url: null, role: 'Demo operator' },
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 60 * 12
    });
  }

  /**
   * Handle the ?code=...&state=... redirect. Called by auth/callback.html.
   * Returns a promise resolving to the new session.
   */
  function handleCallback(search) {
    var params = new URLSearchParams(search || location.search);
    var code = params.get('code');
    var state = params.get('state');
    var oauthError = params.get('error_description') || params.get('error');

    if (oauthError) return Promise.reject(new Error(oauthError));
    if (!code) return Promise.reject(new Error('Missing authorization code.'));

    var expected = sessionStorage.getItem(STATE_KEY);
    if (!expected || state !== expected) {
      return Promise.reject(new Error('OAuth state mismatch — request rejected.'));
    }
    sessionStorage.removeItem(STATE_KEY);

    var cfg = config();
    if (!cfg.tokenExchangeUrl) {
      return Promise.reject(new Error(
        'No token exchange endpoint configured. GitHub requires a server-side ' +
        'exchange for the client secret — set one in Settings.'
      ));
    }

    return fetch(cfg.tokenExchangeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, redirect_uri: callbackUrl() })
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Token exchange failed (HTTP ' + r.status + ')');
        return r.json();
      })
      .then(function (json) {
        if (!json.access_token) throw new Error(json.error_description || 'No access token returned.');
        return fetchUser(json.access_token).then(function (user) {
          return setSession({
            mode: 'github',
            token: json.access_token,
            user: user,
            createdAt: Date.now(),
            expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7
          });
        });
      });
  }

  function fetchUser(token) {
    return fetch(config().apiBase + '/user', {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('GitHub user lookup failed (HTTP ' + r.status + ')');
        return r.json();
      })
      .then(function (u) {
        return { login: u.login, name: u.name || u.login, avatar_url: u.avatar_url, role: 'Director' };
      });
  }

  function returnUrl() {
    var url = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return url || (location.origin + location.pathname.replace(/auth\/callback\.html$/, 'index.html'));
  }

  function logout() {
    clearSession();
    location.reload();
  }

  global.ScorpionAuth = {
    config: config,
    getSession: getSession,
    setSession: setSession,
    clearSession: clearSession,
    isAuthenticated: isAuthenticated,
    login: login,
    loginDemo: loginDemo,
    handleCallback: handleCallback,
    returnUrl: returnUrl,
    logout: logout,
    callbackUrl: callbackUrl
  };
})(window);
