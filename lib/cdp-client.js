/**
 * CDP Client - Zero-dependency Chromium driver over the DevTools Protocol
 *
 * Launches Chromium with remote debugging enabled, discovers the real
 * WebSocket endpoint it advertises, and attaches to a page target so that
 * Page/DOM/CSS/Runtime/Emulation commands can be issued directly.
 */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { getWebSocket, READY_STATE } = require('./websocket-fallback');

const DEVTOOLS_URL_PATTERN = /DevTools listening on (ws:\/\/\S+)/;

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
    this.userDataDir = null;
    this.commandTimeout = options.commandTimeout || 30000;
    this._isConnected = false;
    this._enabledDomains = new Set();
    this._closed = false;
  }

  /**
   * Launch Chromium with CDP enabled and attach to its first page target.
   * @param {Object} options - Launch options
   * @param {string} options.executablePath - Path to Chromium executable
   * @param {number} options.port - CDP port (default: 0, meaning "pick a free one")
   * @param {string[]} options.args - Additional Chromium args
   * @param {number} options.timeout - How long to wait for the browser to report its endpoint
   * @returns {Promise<string>} WebSocket URL of the attached page target
   */
  async launch(options = {}) {
    const { executablePath, port = 0, args = [], timeout = 30000 } = options;

    if (!executablePath) {
      throw new Error('launch() requires an executablePath');
    }

    this.userDataDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'scorpion-cdp-')
    );

    const defaultArgs = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${this.userDataDir}`,
      '--remote-allow-origins=*',
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
      '--use-gl=swiftshader',
      'about:blank'
    ];

    const { spawn } = require('node:child_process');

    this.browserProcess = spawn(executablePath, [...defaultArgs, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const browserWsUrl = await this._waitForDevToolsUrl(timeout);
    const pageWsUrl = await this._findPageTarget(browserWsUrl, timeout);

    await this.connect(pageWsUrl);

    return pageWsUrl;
  }

  /**
   * Read Chromium's stderr until it announces its DevTools endpoint.
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<string>} Browser-level WebSocket URL
   */
  _waitForDevToolsUrl(timeout) {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let settled = false;

      const finish = (error, url) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.browserProcess.stderr.off('data', onData);
        this.browserProcess.off('exit', onExit);
        error ? reject(error) : resolve(url);
      };

      const onData = (chunk) => {
        buffer += chunk.toString();
        const match = buffer.match(DEVTOOLS_URL_PATTERN);
        if (match) {
          finish(null, match[1].trim());
        }
      };

      const onExit = (code) => {
        finish(new Error(
          `Chromium exited with code ${code} before reporting a DevTools endpoint.\n${buffer.trim()}`
        ));
      };

      const timer = setTimeout(() => {
        finish(new Error(
          `Timed out after ${timeout}ms waiting for Chromium's DevTools endpoint.\n${buffer.trim()}`
        ));
      }, timeout);

      this.browserProcess.stderr.on('data', onData);
      this.browserProcess.on('exit', onExit);
    });
  }

  /**
   * Locate a page target to drive. Page/DOM/Emulation commands are
   * target-scoped, so attaching to the browser endpoint alone is not enough.
   * @param {string} browserWsUrl - Browser-level WebSocket URL
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<string>} Page-level WebSocket URL
   */
  async _findPageTarget(browserWsUrl, timeout) {
    const { host } = new URL(browserWsUrl);
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const targets = await this._httpJson(`http://${host}/json/list`);
      const page = targets.find(
        (target) => target.type === 'page' && target.webSocketDebuggerUrl
      );

      if (page) {
        return page.webSocketDebuggerUrl;
      }

      // No page yet (or none left) - ask the browser for one.
      const created = await this._httpJson(
        `http://${host}/json/new?about:blank`,
        'PUT'
      ).catch(() => null);

      if (created?.webSocketDebuggerUrl) {
        return created.webSocketDebuggerUrl;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`No page target became available within ${timeout}ms`);
  }

  /**
   * Minimal JSON fetch against the DevTools HTTP endpoint.
   * @param {string} url - Endpoint URL
   * @param {string} method - HTTP method
   * @returns {Promise<Object>} Parsed JSON body
   */
  _httpJson(url, method = 'GET') {
    return new Promise((resolve, reject) => {
      const request = http.request(url, { method }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          if (response.statusCode >= 400) {
            reject(new Error(`${method} ${url} failed: HTTP ${response.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`${method} ${url} returned invalid JSON: ${error.message}`));
          }
        });
      });

      request.on('error', reject);
      request.end();
    });
  }

  /**
   * Connect to an existing CDP endpoint
   * @param {string} url - WebSocket URL
   * @returns {Promise<void>}
   */
  async connect(url) {
    const WebSocket = getWebSocket();
    this.ws = new WebSocket(url);

    this.ws.on('message', (data) => {
      this._handleMessage(data);
    });

    this.ws.on('error', (error) => {
      this._rejectAllPending(error);
    });

    this.ws.on('close', () => {
      this._isConnected = false;
      if (!this._closed) {
        this._rejectAllPending(new Error('CDP WebSocket closed unexpectedly'));
      }
    });

    // Listen before checking readyState so a fast handshake cannot be missed.
    if (this.ws.readyState !== READY_STATE.OPEN) {
      await once(this.ws, 'open');
    }

    this._isConnected = true;
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
      console.error('Failed to parse CDP message:', error.message);
      return;
    }

    // Response to one of our commands
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

    // Protocol event
    if (message.method) {
      const listeners = this.listeners.get(message.method);
      if (!listeners) return;
      // Copy so a listener that unsubscribes itself does not skip its peers.
      for (const listener of [...listeners]) {
        listener(message.params);
      }
    }
  }

  /**
   * Reject every in-flight command, e.g. when the socket dies.
   * @param {Error} error - Failure cause
   */
  _rejectAllPending(error) {
    for (const [, promise] of this.pending) {
      clearTimeout(promise.timer);
      promise.reject(error);
    }
    this.pending.clear();
  }

  /**
   * Send a CDP command
   * @param {string} method - CDP method (e.g., 'Page.navigate')
   * @param {Object} params - Command parameters
   * @returns {Promise<Object>} Command result
   */
  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== READY_STATE.OPEN) {
      return Promise.reject(new Error('CDP WebSocket is not connected'));
    }

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command ${method} timed out after ${this.commandTimeout}ms`));
      }, this.commandTimeout);

      // Register before sending so a reply can never arrive unclaimed.
      this.pending.set(id, { resolve, reject, timer, method });

      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
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

    // Events are only delivered once their domain is enabled.
    const domain = method.split('.')[0];
    if (domain && !this._enabledDomains.has(domain)) {
      this._enabledDomains.add(domain);
      this.send(`${domain}.enable`).catch(() => {});
    }
  }

  /**
   * Unsubscribe from CDP events
   * @param {string} method - Event method
   * @param {Function} callback - Handler previously passed to on()
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
   * Subscribe to a single occurrence of a CDP event
   * @param {string} method - Event method
   * @param {Function} callback - Event handler
   */
  once(method, callback) {
    const wrapper = (params) => {
      this.off(method, wrapper);
      callback(params);
    };
    this.on(method, wrapper);
  }

  /**
   * Close the connection and cleanup
   */
  async close() {
    this._closed = true;
    this._rejectAllPending(new Error('CDP client closed'));

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.browserProcess) {
      const exited = once(this.browserProcess, 'exit').catch(() => {});
      this.browserProcess.kill();
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 5000))
      ]);
      this.browserProcess.kill('SIGKILL');
      this.browserProcess = null;
    }

    if (this.userDataDir) {
      await fs.promises.rm(this.userDataDir, { recursive: true, force: true })
        .catch(() => {});
      this.userDataDir = null;
    }

    this.listeners.clear();
    this._enabledDomains.clear();
    this._isConnected = false;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  get isConnected() {
    return this._isConnected &&
           Boolean(this.ws) &&
           this.ws.readyState === READY_STATE.OPEN;
  }
}

module.exports = { CDPClient };
