/**
 * CDP Client - Zero-dependency Chromium driver.
 *
 * Uses Node 22's built-in global WebSocket via `lib/cdp-socket.js`, and discovers
 * Chromium's real debugging endpoint via `lib/chrome-launcher.js`. There is no
 * mock transport and no silent degradation: if the browser cannot be driven, this
 * throws, because an audit that cannot inspect a page must never report a result.
 *
 * Session model: connecting to Chromium yields a *browser-level* socket, which does
 * not accept `Page.*`, `DOM.*`, or `CSS.*` commands. This client therefore creates a
 * page target and attaches to it with `flatten: true`, then tags page-scoped
 * commands with that `sessionId`. The previous implementation sent `DOM.enable` and
 * friends straight down the browser connection, which could not have worked.
 */

const { once } = require('node:events');
const { CdpSocket } = require('./cdp-socket');
const { launchChrome } = require('./chrome-launcher');

const DEFAULT_COMMAND_TIMEOUT_MS = 30000;

// Domains that belong to the browser connection rather than a page session.
const BROWSER_LEVEL_DOMAINS = new Set(['Browser', 'Target', 'SystemInfo']);

function isBrowserLevel(method) {
  return BROWSER_LEVEL_DOMAINS.has(method.split('.')[0]);
}

class CDPClient {
  constructor(options = {}) {
    this.socket = null;
    this.messageId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.launched = null;
    this.sessionId = null;
    this.targetId = null;
    this._isConnected = false;
    this._enabledDomains = new Set();
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }

  /**
   * Launch Chromium and attach to a fresh page target.
   * @param {Object} options
   * @param {string} options.executablePath - Path to the Chromium binary
   * @param {string[]} [options.args] - Extra Chromium flags
   * @param {number} [options.timeoutMs] - Launch timeout
   * @returns {Promise<string>} The browser WebSocket URL
   */
  async launch(options = {}) {
    const { executablePath, args = [], timeoutMs } = options;
    if (!executablePath) {
      throw new Error('CDPClient.launch requires an executablePath');
    }

    this.launched = await launchChrome(executablePath, { args, timeoutMs });

    try {
      await this.connect(this.launched.wsUrl);
      await this._attachToPage();
    } catch (error) {
      await this.close();
      throw error;
    }

    return this.launched.wsUrl;
  }

  /**
   * Connect to an existing CDP endpoint.
   * @param {string} url - ws:// URL
   */
  async connect(url) {
    const socket = new CdpSocket(url);
    this.socket = socket;

    // Attach the error handler before awaiting: an EventEmitter 'error' with no
    // listener throws, which would surface as an unrelated crash.
    socket.on('error', (error) => this._failAllPending(error));
    socket.on('close', () => {
      this._isConnected = false;
      this._failAllPending(new Error('CDP connection closed'));
    });
    socket.on('message', (data) => this._handleMessage(data));

    await once(socket, 'open');
    this._isConnected = true;
  }

  /**
   * Create a page target and attach to it, so page-scoped domains are usable.
   */
  async _attachToPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' });
    this.targetId = targetId;

    const { sessionId } = await this.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    this.sessionId = sessionId;
  }

  /**
   * Handle an incoming CDP frame.
   * @param {string} data
   */
  _handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error('Failed to parse CDP message:', error.message);
      return;
    }

    if (message.id !== undefined) {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) {
        const detail = message.error.data ? ` (${message.error.data})` : '';
        entry.reject(new Error(
          `CDP ${entry.method} failed: ${message.error.message || 'unknown error'}${detail}`
        ));
      } else {
        entry.resolve(message.result);
      }
      return;
    }

    if (message.method) {
      const listeners = this.listeners.get(message.method) || [];
      for (const listener of listeners) {
        try {
          listener(message.params);
        } catch (error) {
          console.error(`CDP listener for ${message.method} threw:`, error.message);
        }
      }
    }
  }

  /**
   * Reject every in-flight command. Without this, a dropped connection leaves
   * callers awaiting promises that can never settle.
   * @param {Error} error
   */
  _failAllPending(error) {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }

  /**
   * Send a CDP command.
   * @param {string} method - e.g. 'Page.navigate'
   * @param {Object} [params]
   * @returns {Promise<Object>} Command result
   */
  async send(method, params = {}) {
    if (!this.socket || !this.socket.isOpen) {
      throw new Error(`CDP is not connected; cannot send ${method}`);
    }

    const id = ++this.messageId;
    const message = { id, method, params };

    // Page-scoped commands must carry the session id, or Chromium rejects them.
    if (this.sessionId && !isBrowserLevel(method)) {
      message.sessionId = this.sessionId;
    }

    return new Promise((resolve, reject) => {
      // Without a per-command timeout, a command Chromium never answers hangs
      // the audit forever rather than failing it.
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${this.commandTimeoutMs}ms`));
      }, this.commandTimeoutMs);
      timer.unref?.();

      this.pending.set(id, { resolve, reject, timer, method });

      try {
        this.socket.send(JSON.stringify(message));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Subscribe to a CDP event.
   * @param {string} method - e.g. 'Page.loadEventFired'
   * @param {Function} callback
   */
  on(method, callback) {
    if (!this.listeners.has(method)) {
      this.listeners.set(method, []);
    }
    this.listeners.get(method).push(callback);

    const domain = method.split('.')[0];
    if (domain && !this._enabledDomains.has(domain)) {
      this._enabledDomains.add(domain);
      this.send(`${domain}.enable`).catch(() => { /* domain may not support enable */ });
    }
  }

  /**
   * Close the connection, kill Chromium, and remove the temp profile.
   */
  async close() {
    this._failAllPending(new Error('CDP client closed'));

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.launched) {
      await this.launched.dispose();
      this.launched = null;
    }

    this.pending.clear();
    this.listeners.clear();
    this._enabledDomains.clear();
    this.sessionId = null;
    this.targetId = null;
    this._isConnected = false;
  }

  get isConnected() {
    return this._isConnected && !!this.socket && this.socket.isOpen;
  }
}

module.exports = { CDPClient };
