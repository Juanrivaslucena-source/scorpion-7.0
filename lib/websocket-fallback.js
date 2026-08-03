/**
 * WebSocket Fallback
 *
 * Exposes a single `WebSocket` class with an EventEmitter-style API
 * (`on` / `once` / `off` / `send` / `close` / `readyState`) regardless of which
 * implementation backs it. Resolution order:
 *
 *   1. The global WebSocket built into Node 22+ (zero dependencies).
 *   2. The `ws` package, if it happens to be installed.
 *   3. A mock, only when DESIGN_AUDIT_MOCK_WS=true (tests / offline checks).
 *
 * The mock is never selected implicitly: a silent mock makes a broken CDP
 * connection look like a working one, which is how the audit used to "pass"
 * without ever driving a browser.
 */

const { EventEmitter } = require('node:events');

const READY_STATE = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

/**
 * Adapts the WHATWG WebSocket (EventTarget) built into Node 22+ to the
 * EventEmitter interface the CDP client expects.
 */
class NodeWebSocket extends EventEmitter {
  constructor(url, options = {}) {
    super();

    this._socket = new globalThis.WebSocket(url, options.protocols);
    this._socket.binaryType = 'arraybuffer';

    this._socket.addEventListener('open', () => this.emit('open'));

    this._socket.addEventListener('message', (event) => {
      const { data } = event;
      // CDP frames are text, but tolerate binary in case a peer sends it.
      this.emit('message', typeof data === 'string' ? data : Buffer.from(data));
    });

    this._socket.addEventListener('error', (event) => {
      // EventEmitter throws on an unhandled 'error', so only emit when the
      // caller is listening. Failures still surface via 'close'.
      const error = event.error || new Error(event.message || 'WebSocket error');
      if (this.listenerCount('error') > 0) {
        this.emit('error', error);
      }
    });

    this._socket.addEventListener('close', (event) => {
      this.emit('close', event.code, event.reason);
    });
  }

  get readyState() {
    return this._socket.readyState;
  }

  get url() {
    return this._socket.url;
  }

  send(data) {
    this._socket.send(data);
  }

  close(code, reason) {
    if (this._socket.readyState === READY_STATE.CLOSED ||
        this._socket.readyState === READY_STATE.CLOSING) {
      return;
    }
    this._socket.close(code, reason);
  }

  static get CONNECTING() { return READY_STATE.CONNECTING; }
  static get OPEN() { return READY_STATE.OPEN; }
  static get CLOSING() { return READY_STATE.CLOSING; }
  static get CLOSED() { return READY_STATE.CLOSED; }
}

/**
 * Inert stand-in used by tests. It never connects to anything; every command
 * sent through it is dropped, so it must only be selected explicitly.
 */
class MockWebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = READY_STATE.CONNECTING;
    this.sent = [];

    setTimeout(() => {
      this.readyState = READY_STATE.OPEN;
      this.emit('open');
    }, 0);
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.readyState = READY_STATE.CLOSED;
    this.emit('close', 1000, '');
  }

  static get CONNECTING() { return READY_STATE.CONNECTING; }
  static get OPEN() { return READY_STATE.OPEN; }
  static get CLOSING() { return READY_STATE.CLOSING; }
  static get CLOSED() { return READY_STATE.CLOSED; }
}

/**
 * Pick the WebSocket implementation for this environment.
 * @returns {{ WebSocket: Function, implementation: string }}
 */
function resolveWebSocket() {
  if (process.env.DESIGN_AUDIT_MOCK_WS === 'true') {
    return { WebSocket: MockWebSocket, implementation: 'mock' };
  }

  if (typeof globalThis.WebSocket === 'function') {
    return { WebSocket: NodeWebSocket, implementation: 'node-global' };
  }

  try {
    // Optional: only used if the host project already depends on it.
    const ws = require('ws');
    return { WebSocket: ws, implementation: 'ws-package' };
  } catch {
    throw new Error(
      'No WebSocket implementation available. Node 22+ provides one natively; ' +
      'upgrade Node, install the "ws" package, or set DESIGN_AUDIT_MOCK_WS=true ' +
      'to use the inert test double.'
    );
  }
}

/**
 * Lazily resolved so that merely requiring this module cannot throw in
 * environments that only need the exported classes.
 */
let cached = null;

function getWebSocket() {
  if (!cached) {
    cached = resolveWebSocket();
  }
  return cached.WebSocket;
}

function getImplementation() {
  if (!cached) {
    cached = resolveWebSocket();
  }
  return cached.implementation;
}

module.exports = {
  get WebSocket() {
    return getWebSocket();
  },
  getWebSocket,
  getImplementation,
  NodeWebSocket,
  MockWebSocket,
  READY_STATE
};
