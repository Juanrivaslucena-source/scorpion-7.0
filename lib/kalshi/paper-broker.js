/**
 * Broker
 *
 * The single place in this codebase that submits orders to Kalshi. Nothing else
 * may call client.createOrder() — routing every order through one function is
 * what makes the live-trading gate meaningful rather than decorative.
 *
 * Three modes:
 *   dry-run  Default. Logs what would be sent and calls nothing.
 *   paper    Real orders against Kalshi's demo environment. Fake money.
 *   live     Real orders against production. Real money.
 *
 * Reaching `live` requires FOUR independent conditions, all of which must hold:
 *   1. KALSHI_ENV=prod
 *   2. KALSHI_ALLOW_LIVE=I_UNDERSTAND_REAL_MONEY  (exact string)
 *   3. The --place flag on the command line
 *   4. A passing RiskLimits.preflight()
 *
 * Any one missing and the broker refuses. The redundancy is the point: no
 * single misconfigured environment variable, stale shell, or accidental flag
 * can move a run from analysis to spending money.
 */

const LIVE_CONSENT_PHRASE = 'I_UNDERSTAND_REAL_MONEY';

const MODES = {
  DRY_RUN: 'dry-run',
  PAPER: 'paper',
  LIVE: 'live'
};

/**
 * Error raised when the live-trading gate refuses a run
 */
class TradingGateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TradingGateError';
  }
}

/**
 * Decide which mode a run should execute in
 * @param {Object} options
 * @param {boolean} options.place - Whether --place was passed
 * @param {string} options.env - 'demo' or 'prod'
 * @param {string} [options.liveConsent] - Value of KALSHI_ALLOW_LIVE
 * @param {boolean} [options.scanOnly] - Analysis-only run; placement is impossible
 * @returns {string} One of MODES
 * @throws {TradingGateError} When production placement is requested without consent
 */
function resolveMode({ place, env, liveConsent, scanOnly }) {
  // `npm run kalshi:scan` sets this. It outranks --place so that the scan
  // entry point cannot place orders no matter what flags follow it.
  if (scanOnly) {
    return MODES.DRY_RUN;
  }

  if (!place) {
    return MODES.DRY_RUN;
  }

  if (env === 'demo') {
    return MODES.PAPER;
  }

  if (env === 'prod') {
    if (liveConsent !== LIVE_CONSENT_PHRASE) {
      throw new TradingGateError(
        'Refusing to place live orders with real money.\n' +
          `  KALSHI_ENV is "prod" and --place was given, but KALSHI_ALLOW_LIVE is not set to "${LIVE_CONSENT_PHRASE}".\n` +
          '  Either set KALSHI_ENV=demo to paper trade, or drop --place to dry-run.'
      );
    }
    return MODES.LIVE;
  }

  throw new TradingGateError(`Cannot place orders in unknown environment "${env}"`);
}

/**
 * Strip local bookkeeping fields from an order before it goes over the wire
 * @param {Object} order - Order from the strategy
 * @returns {Object} Payload accepted by POST /portfolio/orders
 */
function toApiPayload(order) {
  const {
    priceCents,
    notionalCents,
    edgeCents,
    entryStyle,
    fairProbability,
    marketProbability,
    ...payload
  } = order;

  return payload;
}

class Broker {
  /**
   * @param {Object} options
   * @param {Object} options.client - KalshiClient instance
   * @param {Object} options.riskLimits - RiskLimits instance
   * @param {boolean} [options.place] - Whether --place was passed
   * @param {string} [options.liveConsent] - Value of KALSHI_ALLOW_LIVE
   * @param {boolean} [options.scanOnly] - Analysis-only run
   * @param {Function} [options.logger] - Log sink
   */
  constructor(options = {}) {
    this.client = options.client;
    this.riskLimits = options.riskLimits;
    this.logger = options.logger || console.log;
    this.place = Boolean(options.place);
    this.liveConsent =
      options.liveConsent !== undefined ? options.liveConsent : process.env.KALSHI_ALLOW_LIVE;
    this.scanOnly =
      options.scanOnly !== undefined
        ? Boolean(options.scanOnly)
        : process.env.KALSHI_SCAN_ONLY === 'true';

    this.env = this.client ? this.client.env : 'demo';
    this.mode = resolveMode({
      place: this.place,
      env: this.env,
      liveConsent: this.liveConsent,
      scanOnly: this.scanOnly
    });
  }

  /**
   * Submit a batch of orders
   *
   * @param {Array} orders - Risk-checked orders from the strategy
   * @param {Object} [state] - Run state passed to RiskLimits.preflight()
   * @returns {Promise<Object>} { mode, placed, failed, skipped }
   */
  async placeOrders(orders, state = {}) {
    const preflight = this.riskLimits
      ? this.riskLimits.preflight(state)
      : { allowed: true, violations: [] };

    if (!preflight.allowed) {
      this.logger('❌ Risk preflight failed; no orders will be placed:');
      for (const violation of preflight.violations) {
        this.logger(`   - ${violation}`);
      }

      return {
        mode: this.mode,
        placed: [],
        failed: [],
        skipped: orders.map(order => ({ order, reason: 'Risk preflight failed' })),
        preflight
      };
    }

    if (this.mode === MODES.DRY_RUN) {
      for (const order of orders) {
        this.logger(
          `   [dry-run] ${order.action} ${order.count} ${order.side.toUpperCase()} ` +
            `${order.ticker} @ ${order.priceCents}c (edge ${order.edgeCents}c)`
        );
      }

      return {
        mode: this.mode,
        placed: [],
        failed: [],
        skipped: orders.map(order => ({ order, reason: 'Dry run; --place not given' })),
        preflight
      };
    }

    if (this.mode === MODES.LIVE) {
      this.logger('');
      this.logger('🔴 LIVE TRADING — these orders spend real money.');
      this.logger('');
    }

    const placed = [];
    const failed = [];

    for (const order of orders) {
      try {
        const result = await this.client.createOrder(toApiPayload(order));
        placed.push({ order, result });
        this.logger(
          `   ✅ ${order.action} ${order.count} ${order.side.toUpperCase()} ` +
            `${order.ticker} @ ${order.priceCents}c`
        );
      } catch (error) {
        failed.push({ order, error: error.message });
        this.logger(`   ❌ ${order.ticker}: ${error.message}`);
      }
    }

    return { mode: this.mode, placed, failed, skipped: [], preflight };
  }

  /**
   * Human-readable description of what this broker will do
   * @returns {string} Mode description
   */
  describe() {
    switch (this.mode) {
      case MODES.DRY_RUN:
        return this.scanOnly
          ? 'scan-only (analysis; placement disabled)'
          : 'dry-run (no orders will be sent)';
      case MODES.PAPER:
        return `paper trading against the ${this.env} environment`;
      case MODES.LIVE:
        return 'LIVE TRADING with real money';
      default:
        return this.mode;
    }
  }
}

module.exports = { Broker, resolveMode, toApiPayload, TradingGateError, MODES, LIVE_CONSENT_PHRASE };
