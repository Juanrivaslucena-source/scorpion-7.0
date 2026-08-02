/**
 * No-Arbitrage Signal
 *
 * A YES contract and a NO contract on the same market are complements: exactly
 * one settles at 100 cents. So the two resting bids must satisfy
 *
 *   yesBid + noBid <= 100
 *
 * If they do not, both bidders can be filled: sell YES at yesBid and NO at
 * noBid, collect more than 100 cents, and owe exactly 100. The difference is
 * risk-free.
 *
 * Note that the "buy both asks below 100" formulation people usually reach for
 * first is the SAME condition, not a second one. Kalshi derives each ask from
 * the opposite side's bid (yesAsk = 100 - noBid), so
 *
 *   yesAsk + noAsk = 200 - (yesBid + noBid)
 *
 * and that falls below 100 exactly when the bids sum above it. Checking both
 * would double-report one opportunity.
 *
 * IMPORTANT: this does not produce a directional probability, and deliberately
 * returns `probability: null`. Capturing the arbitrage requires filling BOTH
 * legs simultaneously; a one-legged position in either direction carries the
 * full market risk and none of the free money. The opportunity is reported as
 * metadata for two-leg or manual handling rather than fed into sizing.
 */

const SIGNAL_ID = 'no-arb';

/**
 * Detect a violation of the no-arbitrage bound
 * @param {Object} market - Canonical market with yesBid/noBid in cents
 * @param {number} minEdgeCents - Minimum violation size worth reporting
 * @returns {Object|null} Violation detail, or null when the bound holds
 */
function findArbitrage(market, minEdgeCents = 1) {
  const { yesBid, noBid } = market;

  if (yesBid === null || noBid === null || yesBid === undefined || noBid === undefined) {
    return null;
  }

  const proceeds = yesBid + noBid;
  const edge = proceeds - 100;

  if (edge < minEdgeCents) {
    return null;
  }

  return {
    type: 'sell-both',
    edgeCents: edge,
    proceedsCents: proceeds,
    legs: [
      { action: 'sell', side: 'yes', priceCents: yesBid },
      { action: 'sell', side: 'no', priceCents: noBid }
    ],
    description:
      `Selling YES at ${yesBid}c and NO at ${noBid}c collects ${proceeds}c ` +
      `against a 100c liability, for ${edge}c risk-free per contract pair. ` +
      'Requires filling both legs; a single leg is an ordinary directional position.'
  };
}

class NoArbSignal {
  /**
   * @param {Object} [options]
   * @param {number} [options.minEdgeCents] - Smallest violation worth reporting
   */
  constructor(options = {}) {
    this.id = SIGNAL_ID;
    this.name = 'No-Arbitrage Bound';
    this.minEdgeCents = options.minEdgeCents ?? 1;
    // Never contributes to the blended probability, so weight is irrelevant.
    this.weight = 0;
  }

  /**
   * Check the no-arbitrage bound for a market
   * @param {Object} context
   * @param {Object} context.market - Canonical market
   * @returns {Object} Signal result; probability is always null by design
   */
  async evaluate({ market }) {
    const violation = findArbitrage(market, this.minEdgeCents);

    return {
      id: this.id,
      name: this.name,
      weight: this.weight,
      probability: null,
      reason: violation
        ? 'Arbitrage detected; reported separately rather than priced directionally'
        : 'No-arbitrage bound holds',
      arbitrage: violation,
      detail: violation ? { ticker: market.ticker, ...violation } : {}
    };
  }
}

module.exports = { NoArbSignal, findArbitrage };
