/**
 * CDP Client - Zero-dependency Chromium driver using WebSocket
 *
 * Uses the WebSocket built into Node 22+ (or the 'ws' package if present).
 *
 * Connection model:
 *   - launch() spawns Chromium and reads the real browser endpoint from its
 *     stderr banner ("DevTools listening on ws://...").
 *   - The browser endpoint only accepts browser-level domains, so the client
 *     creates a page target and attaches to it in flat mode. Every command is
 *     then routed to that page session unless the caller opts out.
 */

const { requireWebSocket } = require('./websocket-fallback');

// WHATWG readyState constants; not all implementations expose them statically.
const OPEN = 1;

const DEVTOOLS_BANNER = /DevTools listening on (ws:\/\/\S+)/;

/**
 * CDPClient - Manages a connection to Chromium via CDP
 */
class CDPClient {
  constructor(options = {}) {
    this.ws = null;
    this.messageId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.browserProcess = null;
    this._isConnected = false;
    this._enabledDomains = new Set();
    this.sessionId = null;
    this.targetId = null;
    this.commandTimeout = options.commandTimeout || 30000;
  }

  /**
   * Launch Chromium with CDP enabled and attach to a page target
   * @param {Object} options - Launch options
   * @param {string} options.executablePath - Path to Chromium executable
   * @param {number} options.port - CDP port (default: 0, let Chromium choose)
   * @param {string[]} options.args - Additional Chromium args
   * @param {number} options.launchTimeout - Milliseconds to wait for the endpoint
   * @returns {Promise<string>} WebSocket URL
   */
  async launch(options = {}) {
    const { executablePath, port = 0, args = [], launchTimeout = 30000 } = options;

    const defaultArgs = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${port}`,
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-client-side-phishing-detection',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--use-gl=swiftshader'
    ];

    const { spawn } = require('node:child_process');

    this.browserProcess = spawn(executablePath, [...defaultArgs, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const wsUrl = await this._waitForEndpoint(launchTimeout);
    await this.connect(wsUrl);
    await this._attachToPage();

    return wsUrl;
  }

  /**
   * Read the browser WebSocket endpoint from Chromium's stderr banner.
   *
   * Chromium prints the endpoint (including its randomly generated browser id)
   * once the debugging port is bound. With --remote-debugging-port=0 the port
   * is also random, so the banner is the only reliable source for both.
   *
   * @param {number} timeout - Milliseconds to wait
   * @returns {Promise<string>} WebSocket URL
   */
  _waitForEndpoint(timeout) {
    return new Promise((resolve, reject) => {
      const proc = this.browserProcess;
      let stderr = '';
      let settled = false;

      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        proc.stderr.off('data', onData);
        proc.off('error', onError);
        proc.off('exit', onExit);
        fn(value);
      };

      const onData = (chunk) => {
        stderr += chunk.toString();
        const match = stderr.match(DEVTOOLS_BANNER);
        if (match) {
          finish(resolve, match[1]);
        }
      };

      const onError = (error) => {
        finish(reject, new Error(`Failed to launch Chromium: ${error.message}`));
      };

      const onExit = (code) => {
        finish(reject, new Error(
          `Chromium exited with code ${code} before the debugging endpoint was ready.\n${stderr.trim()}`
        ));
      };

      const timer = setTimeout(() => {
        finish(reject, new Error(
          `Timed out after ${timeout}ms waiting for the Chromium debugging endpoint.\n${stderr.trim()}`
        ));
      }, timeout);

      proc.stderr.on('data', onData);
      proc.on('error', onError);
      proc.on('exit', onExit);
    });
  }

  /**
   * Create a page target and attach to it, so page-level domains (DOM, CSS,
   * Page, Runtime, Emulation) have a session to run in.
   * @returns {Promise<void>}
   */
  async _attachToPage() {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' }, { browser: true });
    this.targetId = targetId;

    const { sessionId } = await this.send(
      'Target.attachToTarget',
      { targetId, flatten: true },
      { browser: true }
    );
    this.sessionId = sessionId;
  }

  /**
   * Connect to an existing CDP endpoint
   * @param {string} url - WebSocket URL
   * @returns {Promise<void>}
   */
  async connect(url) {
    const WebSocketImpl = requireWebSocket();
    const ws = new WebSocketImpl(url);
    this.ws = ws;

    // The global WebSocket is an EventTarget; 'ws' is an EventEmitter. Support both.
    const addListener = typeof ws.addEventListener === 'function'
      ? (type, fn) => ws.addEventListener(type, fn)
      : (type, fn) => ws.on(type, fn);

    await new Promise((resolve, reject) => {
      let settled = false;

      const onOpen = () => {
        if (settled) return;
        settled = true;
        this._isConnected = true;
        resolve();
      };

      const onOpenError = (event) => {
        if (settled) return;
        settled = true;
        reject(new Error(`Failed to connect to CDP endpoint ${url}: ${this._errorText(event)}`));
      };

      addListener('open', onOpen);
      addListener('error', onOpenError);

      addListener('message', (event) => {
        // EventTarget delivers an event with .data; EventEmitter delivers the payload.
        this._handleMessage(event && event.data !== undefined ? event.data : event);
      });

      addListener('error', (event) => {
        if (!settled) return; // handled by onOpenError
        this._failAllPending(new Error(`CDP WebSocket error: ${this._errorText(event)}`));
      });

      addListener('close', () => {
        this._isConnected = false;
        this._failAllPending(new Error('CDP WebSocket closed'));
      });
    });
  }

  /**
   * Extract a readable message from a WebSocket error event or Error
   * @param {*} event - Error event or Error
   * @returns {string}
   */
  _errorText(event) {
    if (!event) return 'unknown error';
    if (event instanceof Error) return event.message;
    if (event.error instanceof Error) return event.error.message;
    if (typeof event.message === 'string') return event.message;
    return String(event);
  }

  /**
   * Reject every in-flight command; used when the socket dies
   * @param {Error} error - Rejection reason
   */
  _failAllPending(error) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  /**
   * Handle incoming CDP messages
   * @param {Buffer|string} data - Message data
   */
  _handleMessage(data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      console.error('Failed to parse CDP message:', error);
      return;
    }

    // Handle response to our commands
    if (message.id !== undefined) {
      const promise = this.pending.get(message.id);
      if (promise) {
        this.pending.delete(message.id);
        clearTimeout(promise.timer);
        if (message.error) {
          promise.reject(new Error(
            `${promise.method}: ${message.error.message || 'CDP error'}`
          ));
        } else {
          promise.resolve(message.result);
        }
      }
      return;
    }

    // Handle events
    if (message.method) {
      const listeners = this.listeners.get(message.method) || [];
      // Copy: a listener may remove itself while we iterate.
      for (const listener of [...listeners]) {
        listener(message.params);
      }
    }
  }

  /**
   * Send a CDP command
   * @param {string} method - CDP method (e.g., 'Page.navigate')
   * @param {Object} params - Command parameters
   * @param {Object} options - { browser: true } to target the browser session
   * @returns {Promise<Object>} Command result
   */
  async send(method, params = {}, options = {}) {
    if (!this.ws || this.ws.readyState !== OPEN) {
      throw new Error('CDP WebSocket is not connected');
    }

    const id = ++this.messageId;
    const message = { id, method, params };

    // Page-level domains need the attached session; browser-level ones must not have it.
    if (this.sessionId && !options.browser) {
      message.sessionId = this.sessionId;
    }

    // Register before sending: a response can arrive as soon as send() returns.
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command ${method} timed out after ${this.commandTimeout}ms`));
      }, this.commandTimeout);

      this.pending.set(id, { resolve, reject, timer, method });
    });

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      const entry = this.pending.get(id);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
      }
      throw error;
    }

    return result;
  }

  /**
   * Subscribe to CDP events
   * @param {string} method - Event method (e.g., 'Page.loadEventFired')
   * @param {Function} callback - Event handler
   */
  on(method, callback) {
    if (!this.listeners.has(method)) {
      this.listeners.set(method, []);
    }
    this.listeners.get(method).push(callback);

    // Enable the domain if needed
    const domain = method.split('.')[0];
    if (domain && !this._enabledDomains.has(domain)) {
      this._enabledDomains.add(domain);
      this.send(`${domain}.enable`).catch(() => {});
    }
  }

  /**
   * Unsubscribe from CDP events
   * @param {string} method - Event method
   * @param {Function} callback - The handler passed to on()
   */
  off(method, callback) {
    const listeners = this.listeners.get(method);
    if (!listeners) return;

    const index = listeners.indexOf(callback);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
    if (listeners.length === 0) {
      this.listeners.delete(method);
    }
  }

  /**
   * Close the connection and cleanup
   */
  async close() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Socket may already be gone; nothing useful to do.
      }
      this.ws = null;
    }

    this._failAllPending(new Error('CDP client closed'));

    if (this.browserProcess) {
      const proc = this.browserProcess;
      this.browserProcess = null;
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          resolve();
        }, 5000);
        proc.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        proc.kill('SIGTERM');
      });
    }

    this.listeners.clear();
    this._enabledDomains.clear();
    this.sessionId = null;
    this.targetId = null;
    this._isConnected = false;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  get isConnected() {
    return this._isConnected &&
           this.ws !== null &&
           this.ws.readyState === OPEN;
  }
}

module.exports = { CDPClient };
