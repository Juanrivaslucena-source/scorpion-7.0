/**
 * WebSocket Resolution
 *
 * Resolves a usable WebSocket implementation:
 *   1. The global WebSocket built into Node 22+ (preferred, zero dependencies)
 *   2. The 'ws' package, if the host project happens to provide one
 *
 * There is deliberately no mock fallback. A mock that pretends to connect makes
 * the audit report success while inspecting nothing, which is worse than a hard
 * failure.
 */

let WebSocket = null;
let source = null;

if (typeof globalThis.WebSocket === 'function') {
  // Node 22+ ships a WHATWG WebSocket on the global object.
  WebSocket = globalThis.WebSocket;
  source = 'global';
} else {
  try {
    WebSocket = require('ws');
    source = 'ws';
  } catch {
    WebSocket = null;
  }
}

/**
 * Get the resolved WebSocket constructor, or throw a diagnosable error.
 * @returns {Function} WebSocket constructor
 */
function requireWebSocket() {
  if (!WebSocket) {
    throw new Error(
      'No WebSocket implementation available. Node 22+ provides one globally; ' +
      `this process is running ${process.version}. Upgrade Node or install the 'ws' package.`
    );
  }
  return WebSocket;
}

module.exports = {
  WebSocket,
  source,
  isAvailable: WebSocket !== null,
  requireWebSocket
};
