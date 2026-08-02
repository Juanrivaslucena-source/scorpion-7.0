/**
 * Kalshi API Client
 *
 * Zero-dependency client for the Kalshi Trade API v2, built on Node 22's
 * global fetch and node:crypto. No SDK, no npm packages.
 *
 * Environment variables:
 *   KALSHI_ENV               demo | prod   (default: demo)
 *   KALSHI_API_KEY_ID        API key ID from Kalshi account settings
 *   KALSHI_PRIVATE_KEY_PATH  Path to the RSA private key PEM file
 *   KALSHI_PRIVATE_KEY       The PEM itself, as an alternative to the path
 *   KALSHI_TIMEOUT           Per-request timeout in ms (default: 15000)
 *   KALSHI_MAX_RETRIES       Retry attempts for 429/5xx (default: 4)
 *
 * Credentials are NOT shared between environments: a demo key only works
 * against demo, a production key only against production.
 */

const fs = require('node:fs');
const { buildAuthHeaders } = require('./signer');

const BASE_URLS = {
  demo: 'https://demo-api.kalshi.co',
  prod: 'https://api.elections.kalshi.com'
};

const PATH_PREFIX = '/trade-api/v2';

/**
 * Error carrying the HTTP status and parsed body from a failed Kalshi call
 */
class KalshiApiError extends Error {
  constructor(message, { status, body, method, path }) {
    super(message);
    this.name = 'KalshiApiError';
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

/**
 * Resolve the private key from an explicit value, an inline env var, or a file
 * @param {Object} options - Constructor options
 * @returns {string|null} PEM contents, or null when no key is configured
 */
function resolvePrivateKey(options) {
  if (options.privateKeyPem) {
    return options.privateKeyPem;
  }

  if (process.env.KALSHI_PRIVATE_KEY) {
    return process.env.KALSHI_PRIVATE_KEY;
  }

  const keyPath = options.privateKeyPath || process.env.KALSHI_PRIVATE_KEY_PATH;
  if (keyPath) {
    return fs.readFileSync(keyPath, 'utf8');
  }

  return null;
}

/**
 * Sleep for the given number of milliseconds
 * @param {number} ms - Delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class KalshiClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.env] - 'demo' or 'prod'
   * @param {string} [options.keyId] - Kalshi API key ID
   * @param {string} [options.privateKeyPem] - RSA private key PEM
   * @param {string} [options.privateKeyPath] - Path to an RSA private key PEM
   * @param {Function} [options.fetchImpl] - fetch implementation; injectable for tests
   * @param {number} [options.maxRetries] - Retry attempts for 429/5xx
   * @param {number} [options.timeout] - Per-request timeout in ms
   * @param {Function} [options.now] - Clock; injectable for tests
   * @param {Function} [options.sleep] - Backoff sleep; injectable for tests
   */
  constructor(options = {}) {
    // Options win over env, env wins over default (repo-wide convention).
    this.env = options.env || process.env.KALSHI_ENV || 'demo';

    if (!BASE_URLS[this.env]) {
      throw new Error(
        `Unknown KALSHI_ENV "${this.env}". Expected one of: ${Object.keys(BASE_URLS).join(', ')}`
      );
    }

    this.baseUrl = options.baseUrl || BASE_URLS[this.env];
    this.keyId = options.keyId || process.env.KALSHI_API_KEY_ID || null;
    this.privateKeyPem = resolvePrivateKey(options);
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.maxRetries = options.maxRetries ?? parseInt(process.env.KALSHI_MAX_RETRIES || '4', 10);
    this.timeout = options.timeout ?? parseInt(process.env.KALSHI_TIMEOUT || '15000', 10);
    this.now = options.now || Date.now;
    this.sleep = options.sleep || delay;

    if (typeof this.fetchImpl !== 'function') {
      throw new Error('No fetch implementation available. Node 22+ is required.');
    }
  }

  /**
   * Whether this client has credentials to sign requests with
   * @returns {boolean} True when both a key ID and a private key are configured
   */
  isAuthenticated() {
    return Boolean(this.keyId && this.privateKeyPem);
  }

  /**
   * Perform a signed request against the Kalshi API
   * @param {string} method - HTTP method
   * @param {string} endpoint - Endpoint path relative to /trade-api/v2, e.g. '/markets'
   * @param {Object} [options]
   * @param {Object} [options.query] - Query parameters; excluded from the signature
   * @param {Object} [options.body] - JSON request body
   * @param {boolean} [options.requireAuth] - Fail fast when credentials are absent
   * @returns {Promise<Object>} Parsed JSON response
   */
  async request(method, endpoint, { query, body, requireAuth = false } = {}) {
    // The signature covers the prefixed path WITHOUT the query string, so build
    // the signing path first and only then append query parameters to the URL.
    const signingPath = `${PATH_PREFIX}${endpoint}`;
    const url = new URL(signingPath, this.baseUrl);

    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

    if (this.isAuthenticated()) {
      Object.assign(
        headers,
        buildAuthHeaders({
          keyId: this.keyId,
          privateKeyPem: this.privateKeyPem,
          method,
          path: signingPath,
          now: this.now()
        })
      );
    } else if (requireAuth) {
      throw new KalshiApiError(
        `${method} ${endpoint} requires credentials. Set KALSHI_API_KEY_ID and KALSHI_PRIVATE_KEY_PATH.`,
        { status: 401, body: null, method, path: endpoint }
      );
    }

    return this.#send(method, url, headers, body, endpoint);
  }

  /**
   * Send with bounded exponential backoff on 429 and 5xx
   * @param {string} method - HTTP method
   * @param {URL} url - Fully-built request URL
   * @param {Object} headers - Request headers
   * @param {Object} [body] - JSON body
   * @param {string} endpoint - Endpoint path, for error messages
   * @returns {Promise<Object>} Parsed JSON response
   */
  async #send(method, url, headers, body, endpoint) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let response;

      try {
        response = await this.fetchImpl(url.toString(), {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeout)
        });
      } catch (error) {
        // Network-level failure (DNS, TLS, timeout). Retryable.
        lastError = new KalshiApiError(`${method} ${endpoint} failed: ${error.message}`, {
          status: 0,
          body: null,
          method,
          path: endpoint
        });

        if (attempt < this.maxRetries) {
          await this.sleep(this.#backoffMs(attempt));
          continue;
        }

        throw lastError;
      }

      const payload = await this.#parseBody(response);

      if (response.ok) {
        return payload;
      }

      const retryable = response.status === 429 || response.status >= 500;
      lastError = new KalshiApiError(
        `${method} ${endpoint} returned ${response.status}: ${describeBody(payload)}`,
        { status: response.status, body: payload, method, path: endpoint }
      );

      if (!retryable || attempt === this.maxRetries) {
        throw lastError;
      }

      // Honor Retry-After when the exchange tells us how long to wait.
      const retryAfter = parseRetryAfter(response.headers);
      await this.sleep(retryAfter ?? this.#backoffMs(attempt));
    }

    throw lastError;
  }

  /**
   * Exponential backoff with jitter, capped so a wedged endpoint can't stall a run
   * @param {number} attempt - Zero-based attempt number
   * @returns {number} Milliseconds to wait
   */
  #backoffMs(attempt) {
    const base = Math.min(2 ** attempt * 250, 8000);
    return base + Math.floor(Math.random() * 250);
  }

  /**
   * Parse a response body as JSON, tolerating empty and non-JSON payloads
   * @param {Response} response - Fetch response
   * @returns {Promise<Object|string|null>} Parsed body
   */
  async #parseBody(response) {
    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Follow Kalshi's cursor pagination until exhausted
   * @param {string} endpoint - Endpoint path
   * @param {Object} [query] - Query parameters
   * @param {string} collectionKey - Key holding the array in each page
   * @param {Object} [options]
   * @param {number} [options.maxPages] - Safety cap on pages fetched
   * @returns {Promise<Array>} Concatenated items from every page
   */
  async listAll(endpoint, query, collectionKey, { maxPages = 20 } = {}) {
    const items = [];
    let cursor;

    for (let page = 0; page < maxPages; page++) {
      const response = await this.request('GET', endpoint, {
        query: { ...query, cursor }
      });

      const pageItems = (response && response[collectionKey]) || [];
      items.push(...pageItems);

      cursor = response && response.cursor;

      // Kalshi signals exhaustion with an empty cursor or an empty page.
      if (!cursor || pageItems.length === 0) {
        break;
      }
    }

    return items;
  }

  /**
   * List markets
   * @param {Object} [query] - status, series_ticker, event_ticker, limit, ...
   * @returns {Promise<Array>} Raw market objects
   */
  async getMarkets(query = {}) {
    return this.listAll('/markets', { limit: 200, status: 'open', ...query }, 'markets');
  }

  /**
   * Fetch a single market
   * @param {string} ticker - Market ticker
   * @returns {Promise<Object>} Raw market object
   */
  async getMarket(ticker) {
    const response = await this.request('GET', `/markets/${encodeURIComponent(ticker)}`);
    return response.market;
  }

  /**
   * Fetch a market's order book
   * @param {string} ticker - Market ticker
   * @param {number} [depth] - Number of price levels
   * @returns {Promise<Object>} Raw orderbook object
   */
  async getOrderbook(ticker, depth = 10) {
    const response = await this.request('GET', `/markets/${encodeURIComponent(ticker)}/orderbook`, {
      query: { depth }
    });
    return response.orderbook;
  }

  /**
   * Fetch an event and its constituent markets
   * @param {string} eventTicker - Event ticker
   * @returns {Promise<Object>} Raw event object with nested markets
   */
  async getEvent(eventTicker) {
    return this.request('GET', `/events/${encodeURIComponent(eventTicker)}`, {
      query: { with_nested_markets: true }
    });
  }

  /**
   * Fetch the account balance
   * @returns {Promise<Object>} Balance in cents
   */
  async getBalance() {
    return this.request('GET', '/portfolio/balance', { requireAuth: true });
  }

  /**
   * Fetch open positions
   * @returns {Promise<Object>} Positions payload
   */
  async getPositions() {
    return this.request('GET', '/portfolio/positions', { requireAuth: true });
  }

  /**
   * Place an order.
   *
   * Nothing outside lib/kalshi/paper-broker.js should call this — the broker is
   * the single chokepoint where the live-trading gate is enforced.
   * @param {Object} order - Order payload
   * @returns {Promise<Object>} Created order
   */
  async createOrder(order) {
    return this.request('POST', '/portfolio/orders', { body: order, requireAuth: true });
  }

  /**
   * Cancel a resting order
   * @param {string} orderId - Kalshi order ID
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelOrder(orderId) {
    return this.request('DELETE', `/portfolio/orders/${encodeURIComponent(orderId)}`, {
      requireAuth: true
    });
  }
}

/**
 * Read a Retry-After header as milliseconds
 * @param {Headers} headers - Response headers
 * @returns {number|null} Milliseconds to wait, or null when absent/unparseable
 */
function parseRetryAfter(headers) {
  const raw = headers && typeof headers.get === 'function' ? headers.get('retry-after') : null;
  if (!raw) {
    return null;
  }

  const seconds = Number(raw);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
}

/**
 * Render a response body for an error message without dumping a huge payload
 * @param {Object|string|null} body - Parsed body
 * @returns {string} Short description
 */
function describeBody(body) {
  if (body === null || body === undefined) {
    return '(empty body)';
  }

  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

module.exports = { KalshiClient, KalshiApiError, BASE_URLS, PATH_PREFIX };
