/**
 * CDP Socket - EventEmitter adapter over Node 22's global WebSocket.
 *
 * Replaces the former `websocket-fallback.js`, which tried to require the
 * nonexistent module `node:websocket`, silently fell back to a mock that only
 * logged `send()` calls, and thereby made every audit report success without
 * ever inspecting a page.
 *
 * There is deliberately no fallback here. Node 22 exposes `WebSocket` as a
 * global; if it is missing, that is a fatal environment error and must be
 * reported as one. A transport that cannot transport is worse than no
 * transport, because it produces confident, empty results.
 *
 * Node's global WebSocket is an EventTarget. The CDP client uses EventEmitter
 * semantics (`.on`, `.once`, `events.once`). This class bridges the two so the
 * existing call sites keep working and `events.once(socket, 'open')` resolves
 * against a genuine emitter.
 */

const { EventEmitter } = require('node:events');

const DEFAULT_OPEN_TIMEOUT_MS = 10000;

function assertWebSocketAvailable() {
  if (typeof globalThis.WebSocket !== 'function') {
    throw new Error(
      `Scorpion requires Node >= 22 for the built-in global WebSocket. ` +
      `Running ${process.version}, where globalThis.WebSocket is ` +
      `${typeof globalThis.WebSocket}. Upgrade Node; do not install a WebSocket ` +
      `package — the zero-dependency policy is deliberate.`
    );
  }
}

class CdpSocket extends EventEmitter {
  /**
   * @param {string} url - ws:// endpoint from DevToolsActivePort or /json/version
   * @param {Object} [options]
   * @param {number} [options.openTimeoutMs] - fail if the socket never opens
   */
  constructor(url, options = {}) {
    super();
    assertWebSocketAvailable();

    const openTimeoutMs = options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS;
    this.url = url;
    this._opened = false;

    const ws = new globalThis.WebSocket(url);
    ws.binaryType = 'arraybuffer';
    this._ws = ws;

    // Fires only if 'open' never arrives. Unref'd so a pending timer cannot
    // hold the process open on an otherwise clean exit.
    const openTimer = setTimeout(() => {
      if (this._opened) return;
      this.emit('error', new Error(
        `CDP WebSocket did not open within ${openTimeoutMs}ms: ${url}`
      ));
      try { ws.close(); } catch { /* already gone */ }
    }, openTimeoutMs);
    openTimer.unref?.();
    this._openTimer = openTimer;

    ws.addEventListener('open', () => {
      this._opened = true;
      clearTimeout(openTimer);
      this.emit('open');
    });

    // CDP frames are UTF-8 JSON text. Normalize to string so downstream
    // JSON.parse never sees an ArrayBuffer.
    ws.addEventListener('message', (event) => {
      const { data } = event;
      this.emit('message',
        typeof data === 'string' ? data : Buffer.from(data).toString('utf8'));
    });

    ws.addEventListener('error', (event) => {
      clearTimeout(openTimer);
      this.emit('error', event?.error ?? new Error(`CDP WebSocket error: ${url}`));
    });

    ws.addEventListener('close', (event) => {
      clearTimeout(openTimer);
      this._opened = false;
      this.emit('close', event?.code, event?.reason);
    });
  }

  send(data) {
    this._ws.send(data);
  }

  close(code, reason) {
    clearTimeout(this._openTimer);
    try {
      this._ws.close(code, reason);
    } catch { /* closing an already-closed socket is not an error here */ }
  }

  get readyState() {
    return this._ws.readyState;
  }

  get isOpen() {
    return this._opened;
  }
}

module.exports = { CdpSocket, assertWebSocketAvailable };
