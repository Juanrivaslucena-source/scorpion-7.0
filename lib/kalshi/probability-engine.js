/**
 * Probability Engine
 *
 * Orchestrates the deterministic signals into a single fair-probability
 * estimate per market, and reports the edge against the market's own price.
 *
 * Order of operations matters. Liquidity gates run FIRST, before any estimate
 * is produced, because edge in a market with no depth is not edge — it is a
 * number you cannot trade against. Filtering afterwards would mean ranking
 * candidates that were never actionable.
 *
 * Environment variables:
 *   KALSHI_MIN_VOLUME_24H     Minimum 24h contract volume (default: 500)
 *   KALSHI_MIN_OPEN_INTEREST  Minimum open interest (default: 500)
 *   KALSHI_MAX_SPREAD_CENTS   Widest tradeable spread (default: 6)
 *   KALSHI_MIN_HOURS_TO_CLOSE Minimum time to resolution (default: 2)
 */

const { hoursToClose } = require('./markets');
const { OrderbookSignal } = require('./signals/orderbook-signal');
const { NoArbSignal } = require('./signals/no-arb-signal');
const { EventConsistencySignal } = require('./signals/event-consistency-signal');

class ProbabilityEngine {
  /**
   * @param {Object} [options]
   * @param {number} [options.minVolume24h] - Minimum 24h volume to consider a market
   * @param {number} [options.minOpenInterest] - Minimum open interest
   * @param {number} [options.maxSpreadCents] - Widest spread still considered tradeable
   * @param {number} [options.minHoursToClose] - Minimum time to resolution
   * @param {Array} [options.signals] - Replace the default signal set
   * @param {Function} [options.now] - Clock; injectable for tests
   */
  constructor(options = {}) {
    this.minVolume24h =
      options.minVolume24h ?? parseInt(process.env.KALSHI_MIN_VOLUME_24H || '500', 10);
    this.minOpenInterest =
      options.minOpenInterest ?? parseInt(process.env.KALSHI_MIN_OPEN_INTEREST || '500', 10);
    this.maxSpreadCents =
      options.maxSpreadCents ?? parseInt(process.env.KALSHI_MAX_SPREAD_CENTS || '6', 10);
    this.minHoursToClose =
      options.minHoursToClose ?? parseFloat(process.env.KALSHI_MIN_HOURS_TO_CLOSE || '2');

    this.now = options.now || Date.now;

    this.signals = options.signals || [
      new OrderbookSignal({ maxSpreadCents: this.maxSpreadCents }),
      new NoArbSignal(),
      new EventConsistencySignal()
    ];
  }

  /**
   * Register an additional signal
   * @param {Object} signal - Object with `id`, `name`, `weight`, and `evaluate(context)`
   * @returns {ProbabilityEngine} this, for chaining
   */
  addSignal(signal) {
    if (!signal || typeof signal.evaluate !== 'function') {
      throw new TypeError('A signal must expose an async evaluate(context) method');
    }

    this.signals.push(signal);
    return this;
  }

  /**
   * Apply the liquidity gates to a single market
   * @param {Object} market - Canonical market
   * @returns {Object} { tradeable, reasons[] }
   */
  checkLiquidity(market) {
    const reasons = [];

    if (market.status && market.status !== 'active' && market.status !== 'open') {
      reasons.push(`Market status is "${market.status}"`);
    }

    if (market.marketProbability === null) {
      reasons.push('No tradeable price');
    }

    if (market.volume24h !== null && market.volume24h < this.minVolume24h) {
      // Messages here must not start with a digit: the report groups skipped
      // markets by collapsing every numeric run, and a leading number would be
      // collapsed along with the values.
      reasons.push(`Daily volume ${market.volume24h} below minimum ${this.minVolume24h}`);
    }

    if (market.openInterest !== null && market.openInterest < this.minOpenInterest) {
      reasons.push(`Open interest ${market.openInterest} below minimum ${this.minOpenInterest}`);
    }

    if (market.spreadCents !== null && market.spreadCents > this.maxSpreadCents) {
      reasons.push(`Spread ${market.spreadCents}c exceeds maximum ${this.maxSpreadCents}c`);
    }

    const hours = hoursToClose(market, this.now());
    if (hours !== null && hours < this.minHoursToClose) {
      reasons.push(`Closes in ${hours.toFixed(1)}h, below minimum ${this.minHoursToClose}h`);
    }

    return { tradeable: reasons.length === 0, reasons };
  }

  /**
   * Combine signal outputs into a single fair probability
   * @param {Array} signalResults - Results from every signal
   * @returns {Object} { probability, contributing[] }
   */
  combine(signalResults) {
    const contributing = signalResults.filter(
      result =>
        result.probability !== null &&
        result.probability !== undefined &&
        Number.isFinite(result.weight) &&
        result.weight > 0
    );

    if (contributing.length === 0) {
      return { probability: null, contributing: [] };
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (const result of contributing) {
      weightedSum += result.probability * result.weight;
      totalWeight += result.weight;
    }

    if (totalWeight <= 0) {
      return { probability: null, contributing };
    }

    return { probability: weightedSum / totalWeight, contributing };
  }

  /**
   * Score a single market
   * @param {Object} context
   * @param {Object} context.market - Canonical market
   * @param {Object} [context.orderbook] - Raw orderbook
   * @param {Array} [context.siblings] - Every leg of the market's event
   * @param {boolean} [context.mutuallyExclusive] - Whether the legs are MECE
   * @returns {Promise<Object>} Candidate, or a rejection record
   */
  async scoreMarket(context) {
    const { market } = context;
    const liquidity = this.checkLiquidity(market);

    if (!liquidity.tradeable) {
      return {
        ticker: market.ticker,
        skipped: true,
        reasons: liquidity.reasons
      };
    }

    const signalResults = [];
    for (const signal of this.signals) {
      signalResults.push(await signal.evaluate(context));
    }

    const combined = this.combine(signalResults);

    // Arbitrage is surfaced separately from the directional estimate: it is a
    // two-leg opportunity, and a one-legged version of it is just a normal
    // position with normal risk. See lib/kalshi/signals/no-arb-signal.js.
    const arbitrage = signalResults.map(result => result.arbitrage).find(Boolean) || null;

    if (combined.probability === null) {
      return {
        ticker: market.ticker,
        skipped: true,
        reasons: ['No signal produced an estimate'],
        arbitrage,
        signals: signalResults
      };
    }

    const edge = combined.probability - market.marketProbability;

    return {
      ticker: market.ticker,
      eventTicker: market.eventTicker,
      title: market.title,
      skipped: false,
      marketProbability: market.marketProbability,
      fairProbability: combined.probability,
      edge,
      edgeCents: Number((edge * 100).toFixed(2)),
      arbitrage,
      // Positive edge means the market underprices YES; buy YES. Negative means
      // it overprices YES, which is the same as underpricing NO; buy NO.
      side: edge >= 0 ? 'yes' : 'no',
      market,
      signals: signalResults,
      liquidity: {
        volume24h: market.volume24h,
        openInterest: market.openInterest,
        spreadCents: market.spreadCents,
        hoursToClose: hoursToClose(market, this.now())
      }
    };
  }

  /**
   * Score every market and return the candidates worth acting on
   * @param {Array} markets - Canonical markets
   * @param {Object} [context]
   * @param {Map} [context.orderbooks] - ticker -> raw orderbook
   * @param {Map} [context.events] - eventTicker -> { markets, mutuallyExclusive }
   * @returns {Promise<Object>} { candidates, skipped, arbitrage }
   */
  async run(markets, context = {}) {
    const orderbooks = context.orderbooks || new Map();
    const events = context.events || new Map();

    const candidates = [];
    const skipped = [];
    const arbitrage = [];

    for (const market of markets) {
      const event = market.eventTicker ? events.get(market.eventTicker) : null;

      const result = await this.scoreMarket({
        market,
        orderbook: orderbooks.get(market.ticker) || null,
        siblings: event ? event.markets : null,
        mutuallyExclusive: Boolean(event && event.mutuallyExclusive)
      });

      if (result.arbitrage) {
        arbitrage.push({ ticker: result.ticker, ...result.arbitrage });
      }

      if (result.skipped) {
        skipped.push(result);
      } else {
        candidates.push(result);
      }
    }

    candidates.sort((a, b) => Math.abs(b.edgeCents) - Math.abs(a.edgeCents));
    arbitrage.sort((a, b) => b.edgeCents - a.edgeCents);

    return { candidates, skipped, arbitrage };
  }
}

module.exports = { ProbabilityEngine };
