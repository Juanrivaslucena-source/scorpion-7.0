/**
 * WebSocket Fallback
 * 
 * Provides WebSocket functionality for environments where node:websocket is not available.
 * Uses the 'ws' package if available, otherwise provides a mock for testing.
 */

let WebSocket;

try {
  // Try Node 22+ built-in WebSocket
  WebSocket = require('node:websocket');
} catch (e) {
  try {
    // Try the 'ws' package
    WebSocket = require('ws');
  } catch (e2) {
    // Fallback to a simple mock for testing/environments without WebSocket
    class MockWebSocket {
      constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        this.listeners = {
          open: [],
          message: [],
          error: [],
          close: []
        };
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        
        // Simulate connection after a short delay
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this._emit('open');
        }, 100);
      }

      on(type, callback) {
        if (this.listeners[type]) {
          this.listeners[type].push(callback);
        }
      }

      _emit(type, ...args) {
        if (this[`on${type}`]) {
          this[`on${type}`](...args);
        }
        if (this.listeners[type]) {
          for (const listener of this.listeners[type]) {
            listener(...args);
          }
        }
      }

      send(data) {
        // In mock mode, just log the message
        console.log('[MOCK WS] Sent:', data.toString().substring(0, 100));
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        this._emit('close');
      }

      static get CONNECTING() { return 0; }
      static get OPEN() { return 1; }
      static get CLOSING() { return 2; }
      static get CLOSED() { return 3; }
    }

    WebSocket = MockWebSocket;
    
    console.warn('Using mock WebSocket - CDP functionality will be limited');
  }
}

module.exports = { WebSocket };
