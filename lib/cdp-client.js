/**
 * CDP Client - Zero-dependency Chromium driver using WebSocket
 * 
 * This module provides a lightweight interface to Chrome DevTools Protocol.
 * Uses node:websocket (Node 22+), falls back to 'ws' package, or mock for testing.
 */

const { WebSocket } = require('./websocket-fallback');
const { once } = require('node:events');

/**
 * CDPClient - Manages a connection to Chromium via CDP
 */
class CDPClient {
  constructor() {
    this.ws = null;
    this.messageId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    this.browserProcess = null;
    this._isConnected = false;
    this._enabledDomains = new Set();
  }

  /**
   * Launch Chromium with CDP enabled
   * @param {Object} options - Launch options
   * @param {string} options.executablePath - Path to Chromium executable
   * @param {number} options.port - CDP port (default: 0 for random)
   * @param {string[]} options.args - Additional Chromium args
   * @returns {Promise<string>} WebSocket URL
   */
  async launch(options = {}) {
    const { executablePath, port = 0, args = [] } = options;
    
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

    // Wait for the debugging port to be ready
    const wsUrl = await this._getWebSocketUrl(port);
    await this.connect(wsUrl);
    
    return wsUrl;
  }

  /**
   * Get WebSocket URL from Chromium
   * @param {number} port - Debugging port
   * @returns {Promise<string>} WebSocket URL
   */
  async _getWebSocketUrl(port) {
    // If port is 0, we need to read it from stderr or use a known endpoint
    if (port === 0) {
      // For headless=new, the DevTools URL is typically at http://localhost:9222
      // But we need to get the actual port
      await new Promise(resolve => setTimeout(resolve, 1000));
      return 'ws://localhost:9222/devtools/browser/00000000-0000-0000-0000-000000000000';
    }
    return `ws://localhost:${port}/devtools/browser/00000000-0000-0000-0000-000000000000`;
  }

  /**
   * Connect to existing CDP endpoint
   * @param {string} url - WebSocket URL
   * @returns {Promise<void>}
   */
  async connect(url) {
    this.ws = new WebSocket(url);
    
    this.ws.on('open', () => {
      this._isConnected = true;
    });

    this.ws.on('message', (data) => {
      this._handleMessage(data);
    });

    this.ws.on('error', (error) => {
      console.error('CDP WebSocket error:', error.message);
      this._handleError(error);
    });

    this.ws.on('close', () => {
      this._isConnected = false;
    });

    // Wait for connection
    await once(this.ws, 'open');
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
        if (message.error) {
          promise.reject(new Error(message.error.message || 'CDP error'));
        } else {
          promise.resolve(message.result);
        }
      }
      return;
    }

    // Handle events
    if (message.method) {
      const listeners = this.listeners.get(message.method) || [];
      for (const listener of listeners) {
        listener(message.params);
      }
    }
  }

  /**
   * Send a CDP command
   * @param {string} method - CDP method (e.g., 'Page.navigate')
   * @param {Object} params - Command parameters
   * @returns {Promise<Object>} Command result
   */
  async send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('CDP WebSocket is not connected');
    }

    const id = ++this.messageId;
    const message = {
      id,
      method,
      params
    };

    this.ws.send(JSON.stringify(message));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
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
    
    // Enable the domain if needed
    const domain = method.split('.')[0];
    if (domain && !this._enabledDomains.has(domain)) {
      this._enabledDomains.add(domain);
      this.send(`${domain}.enable`).catch(() => {});
    }
  }

  /**
   * Close the connection and cleanup
   */
  async close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    if (this.browserProcess) {
      this.browserProcess.kill();
      this.browserProcess = null;
    }
    
    this.pending.clear();
    this.listeners.clear();
    this._isConnected = false;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  get isConnected() {
    return this._isConnected && 
           this.ws && 
           this.ws.readyState === WebSocket.OPEN;
  }
}

module.exports = { CDPClient };
