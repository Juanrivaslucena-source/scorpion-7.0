/**
 * scripts/lib/cdp.js
 * Minimal Chrome DevTools Protocol client — zero dependencies.
 *
 * Node 18+ ships a global WebSocket and fetch, which is everything we need to
 * drive a real browser. This exists so the design audit doesn't depend on
 * Playwright (a ~300MB install that also downloads its own browser).
 */

const { spawn } = require('child_process');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch (err) { lastErr = err; }
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastErr?.message || 'no response'}`);
}

/**
 * A CDP session bound to one page target.
 * Methods mirror the protocol: session.send('Page.navigate', {...}).
 */
class Session {
  constructor(ws, sessionId) {
    this.ws = ws;
    this.sessionId = sessionId;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (this.sessionId) payload.sessionId = this.sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
    });
  }

  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
  }

  dispatch(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject, method } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
      return;
    }
    if (msg.method && this.handlers.has(msg.method)) {
      for (const fn of this.handlers.get(msg.method)) fn(msg.params);
    }
  }

  /** Evaluate an expression in the page and return the value by JSON. */
  async evaluate(expression, { awaitPromise = true } = {}) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (res.exceptionDetails) {
      const text = res.exceptionDetails.exception?.description
        || res.exceptionDetails.text
        || 'evaluation failed';
      throw new Error(text);
    }
    return res.result?.value;
  }

  /**
   * Navigate and wait for the load event.
   *
   * Same-document navigation (a URL differing only by #hash) fires no load
   * event, so waiting for one would always burn the full timeout. Detect that
   * case and resolve on the navigation response instead.
   */
  async navigate(url, { waitUntil = 'load', timeoutMs = 30000 } = {}) {
    const current = await this.evaluate('location.href').catch(() => null);
    const sameDocument = current
      && current.split('#')[0] === url.split('#')[0]
      && current !== 'about:blank';

    if (sameDocument) {
      await this.send('Page.navigate', { url });
      // Give the hashchange handler a turn of the event loop.
      await sleep(50);
      return;
    }

    const event = waitUntil === 'domcontentloaded'
      ? 'Page.domContentEventFired'
      : 'Page.loadEventFired';

    let settle;
    const loaded = new Promise((resolve) => { settle = resolve; });
    const timer = setTimeout(settle, timeoutMs);
    this.on(event, settle);

    await this.send('Page.navigate', { url });
    await loaded;
    clearTimeout(timer);
  }

  /** Force a full document reload, bypassing same-document shortcuts. */
  async reload({ timeoutMs = 30000 } = {}) {
    let settle;
    const loaded = new Promise((resolve) => { settle = resolve; });
    const timer = setTimeout(settle, timeoutMs);
    this.on('Page.loadEventFired', settle);
    await this.send('Page.reload', { ignoreCache: false });
    await loaded;
    clearTimeout(timer);
  }

  async setViewport({ width, height, deviceScaleFactor = 1, mobile = false }) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor, mobile,
    });
  }

  async screenshot({ fullPage = false } = {}) {
    const params = { format: 'png', captureBeyondViewport: fullPage };
    if (fullPage) {
      const m = await this.send('Page.getLayoutMetrics');
      const w = Math.ceil(m.cssContentSize?.width || m.contentSize.width);
      const h = Math.ceil(m.cssContentSize?.height || m.contentSize.height);
      params.clip = { x: 0, y: 0, width: w, height: h, scale: 1 };
    }
    const { data } = await this.send('Page.captureScreenshot', params);
    return Buffer.from(data, 'base64');
  }

  async click(selector) {
    const ok = await this.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.click();
      return true;
    })()`);
    if (!ok) throw new Error(`click: no element matching ${selector}`);
  }
}

class Browser {
  constructor(proc, ws, userDataDir) {
    this.proc = proc;
    this.ws = ws;
    this.userDataDir = userDataDir;
    this.sessions = new Map();
    this.rootPending = new Map();
    this.rootNextId = 1e6;

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.sessionId && this.sessions.has(msg.sessionId)) {
        this.sessions.get(msg.sessionId).dispatch(msg);
        return;
      }
      if (msg.id && this.rootPending.has(msg.id)) {
        const { resolve, reject } = this.rootPending.get(msg.id);
        this.rootPending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  sendRoot(method, params = {}) {
    const id = this.rootNextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.rootPending.set(id, { resolve, reject });
    });
  }

  /** Open a fresh tab and return an attached Session. */
  async newPage() {
    const { targetId } = await this.sendRoot('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await this.sendRoot('Target.attachToTarget', { targetId, flatten: true });
    const session = new Session(this.ws, sessionId);
    this.sessions.set(sessionId, session);
    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Log.enable');
    await session.send('Network.enable');
    return session;
  }

  async close() {
    try { this.ws.close(); } catch { /* already closed */ }
    if (this.proc && !this.proc.killed) {
      this.proc.kill('SIGTERM');
      await sleep(200);
      if (!this.proc.killed) this.proc.kill('SIGKILL');
    }
    if (this.userDataDir) {
      try { fs.rmSync(this.userDataDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}

/**
 * Launch Chromium with remote debugging and connect.
 * @param {object} opts - {executablePath, headless, libraryPath, args}
 */
async function launch(opts = {}) {
  const executablePath = opts.executablePath;
  if (!executablePath || !fs.existsSync(executablePath)) {
    throw new Error(`Chromium not found at "${executablePath}".`);
  }

  const port = await freePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scorpion-cdp-'));

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    ...(opts.headless === false ? [] : ['--headless=new']),
    ...(opts.args || []),
  ];

  const env = { ...process.env };
  if (opts.libraryPath) {
    env.LD_LIBRARY_PATH = [opts.libraryPath, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  }

  const proc = spawn(executablePath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString().slice(0, 2000); });
  proc.on('exit', (code) => {
    if (code && code !== 0 && !proc._expected) {
      console.error(`[cdp] chromium exited ${code}\n${stderr.slice(0, 600)}`);
    }
  });

  let version;
  try {
    version = await waitForHttp(`http://127.0.0.1:${port}/json/version`, 20000);
  } catch (err) {
    proc.kill('SIGKILL');
    throw new Error(`${err.message}\nchromium stderr:\n${stderr.slice(0, 600)}`);
  }

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('CDP websocket failed')), { once: true });
  });

  return new Browser(proc, ws, userDataDir);
}

module.exports = { launch, Browser, Session, sleep };
