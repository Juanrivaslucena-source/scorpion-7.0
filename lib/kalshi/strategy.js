/**
 * Position Sizing Strategy
 *
 * Converts scored candidates into concrete limit orders.
 *
 * Sizing is fractional Kelly. For a binary contract bought at price p with a
 * believed probability q, the full-Kelly stake fraction reduces cleanly to:
 *
 *   f* = (q - p) / (1 - p)
 *
 * Full Kelly is growth-optimal only if q is exactly right, and q here is an
 * estimate. Being wrong about q by a little produces wildly oversized bets, so
 * a fraction of Kelly (default one quarter) is used instead. That gives up some
 * theoretical growth in exchange for surviving a bad estimate.
 *
 * The executable edge is measured against the price we would actually PAY (the
 * ask), not the midpoint. Mid-based edge routinely evaporates on contact with
 * the spread; ask-based edge is the edge that exists after the fill.
 *
 * Environment variables:
 *   KALSHI_KELLY_FRACTION   Fraction of full Kelly to stake (default: 0.25)
 *   KALSHI_MAX_BANKROLL_PCT Cap on any single position as a fraction (default: 0.05)
 */

const crypto = require('node:crypto');
const { probabilityToCents } = require('./markets');

/**
 * Full-Kelly stake fraction for a binary contract
 * @param {number} fairProbability - Believed probability the contract settles at 100c
 * @param {number} entryProbability - Entry price expressed as a probability
 * @returns {number} Kelly fraction, 0 when there is no edge
 */
function kellyFraction(fairProbability, entryProbability) {
  if (entryProbability >= 1 || entryProbability <= 0) {
    return 0;
  }

  const fraction = (fairProbability - entryProbability) / (1 - entryProbability);
  return fraction > 0 ? fraction : 0;
}

/**
 * Determine the entry price and believed value for the side being traded
 *
 * A candidate whose fair value is BELOW the market price is not a reason to
 * pass — it means NO is underpriced by the same amount, so the trade is to buy
 * NO. Both sides are expressed in their own price terms here.
 *
 * Two entry styles, and the difference matters more than it looks:
 *
 *   passive     Post at the current best bid and wait. Captures the spread,
 *               at the cost of an uncertain fill.
 *   aggressive  Cross to the ask for an immediate fill, paying the spread.
 *
 * Passive is the default because most of the signals here are book-derived,
 * and a book-derived estimate is mathematically bounded by the book: a
 * microprice can never exceed the ask, so crossing to the ask always wipes out
 * the edge that justified the trade. An aggressive entry only makes sense when
 * the estimate comes from outside the book — the LLM overlay or the event
 * consistency signal.
 * @param {Object} candidate - Scored candidate
 * @param {string} entryStyle - 'passive' or 'aggressive'
 * @returns {Object|null} { side, entryCents, fairCents } or null when unpriceable
 */
function resolveSide(candidate, entryStyle = 'passive') {
  const market = candidate.market;
  const fairYesCents = candidate.fairProbability * 100;
  const wantsYes = candidate.side === 'yes';

  const entryCents = wantsYes
    ? entryStyle === 'aggressive'
      ? market.yesAsk
      : market.yesBid
    : entryStyle === 'aggressive'
      ? market.noAsk
      : market.noBid;

  if (entryCents === null || entryCents === undefined) {
    return null;
  }

  return {
    side: wantsYes ? 'yes' : 'no',
    entryCents,
    // Buying NO: our believed value for NO is the complement of the YES estimate.
    fairCents: wantsYes ? fairYesCents : 100 - fairYesCents,
    entryStyle
  };
}

/**
 * Deterministic client order ID so a retried run cannot double-fill
 * @param {string} runId - Identifier for this run
 * @param {string} ticker - Market ticker
 * @param {string} side - 'yes' or 'no'
 * @returns {string} Stable client order ID
 */
function buildClientOrderId(runId, ticker, side) {
  return crypto
    .createHash('sha256')
    .update(`${runId}:${ticker}:${side}`)
    .digest('hex')
    .slice(0, 32);
}

class Strategy {
  /**
   * @param {Object} [options]
   * @param {number} [options.kellyFraction] - Fraction of full Kelly to stake
   * @param {number} [options.maxBankrollFraction] - Cap on a single position
   * @param {string} [options.entryStyle] - 'passive' (post at the bid) or 'aggressive' (cross)
   * @param {Object} [options.riskLimits] - RiskLimits instance
   */
  constructor(options = {}) {
    this.kellyFraction =
      options.kellyFraction ?? parseFloat(process.env.KALSHI_KELLY_FRACTION || '0.25');
    this.maxBankrollFraction =
      options.maxBankrollFraction ?? parseFloat(process.env.KALSHI_MAX_BANKROLL_PCT || '0.05');
    this.entryStyle = options.entryStyle || process.env.KALSHI_ENTRY_STYLE || 'passive';
    this.riskLimits = options.riskLimits || null;
  }

  /**
   * Size a single candidate into an order
   * @param {Object} candidate - Scored candidate
   * @param {Object} context
   * @param {number} context.bankrollCents - Capital available for sizing
   * @param {string} context.runId - Run identifier for the client order ID
   * @returns {Object|null} Order, or null when the candidate is not tradeable
   */
  sizeCandidate(candidate, { bankrollCents, runId }) {
    const resolved = resolveSide(candidate, this.entryStyle);

    if (!resolved) {
      return null;
    }

    const { side, entryCents, fairCents } = resolved;
    const executableEdgeCents = fairCents - entryCents;

    // No edge left at the price we would actually transact. This is the common
    // case for a candidate that looked attractive against the midpoint.
    if (executableEdgeCents <= 0) {
      return null;
    }

    if (this.riskLimits && executableEdgeCents < this.riskLimits.minEdgeCents) {
      return null;
    }

    const fullKelly = kellyFraction(fairCents / 100, entryCents / 100);
    const stakeFraction = Math.min(fullKelly * this.kellyFraction, this.maxBankrollFraction);

    if (stakeFraction <= 0) {
      return null;
    }

    const stakeCents = stakeFraction * bankrollCents;
    let count = Math.floor(stakeCents / entryCents);

    if (this.riskLimits) {
      count = Math.min(count, this.riskLimits.maxContractsPerOrder);
    }

    if (count < 1) {
      return null;
    }

    const priceCents = probabilityToCents(entryCents / 100);

    return {
      ticker: candidate.ticker,
      action: 'buy',
      side,
      count,
      type: 'limit',
      // Kalshi takes the limit price on the field matching the side traded.
      ...(side === 'yes' ? { yes_price: priceCents } : { no_price: priceCents }),
      client_order_id: buildClientOrderId(runId, candidate.ticker, side),

      // Local bookkeeping; stripped before the payload is sent.
      priceCents,
      notionalCents: count * priceCents,
      edgeCents: Number(executableEdgeCents.toFixed(2)),
      entryStyle: this.entryStyle,
      fairProbability: candidate.fairProbability,
      marketProbability: candidate.marketProbability
    };
  }

  /**
   * Build a risk-checked order list from scored candidates
   * @param {Array} candidates - Scored candidates, best first
   * @param {Object} context
   * @param {number} context.bankrollCents - Capital available for sizing
   * @param {string} context.runId - Run identifier
   * @param {Object} [context.portfolio] - Existing exposure
   * @returns {Object} { orders, rejected }
   */
  buildOrders(candidates, { bankrollCents, runId, portfolio = {} }) {
    const orders = [];
    const rejected = [];

    // Exposure accumulates across the run so the caps apply to the whole batch,
    // not just to each order in isolation.
    const exposureByTicker = new Map(
      portfolio.exposureByTicker instanceof Map ? portfolio.exposureByTicker : []
    );
    let openNotionalCents = Number.isFinite(portfolio.openNotionalCents)
      ? portfolio.openNotionalCents
      : 0;

    for (const candidate of candidates) {
      const order = this.sizeCandidate(candidate, { bankrollCents, runId });

      if (!order) {
        rejected.push({
          ticker: candidate.ticker,
          reasons: ['No executable edge after the spread, or size rounded to zero']
        });
        continue;
      }

      if (this.riskLimits) {
        const verdict = this.riskLimits.check(order, {
          openNotionalCents,
          exposureByTicker,
          balanceCents: bankrollCents - openNotionalCents
        });

        if (!verdict.allowed) {
          rejected.push({ ticker: order.ticker, reasons: verdict.violations });
          continue;
        }
      }

      orders.push(order);
      openNotionalCents += order.notionalCents;
      exposureByTicker.set(
        order.ticker,
        (exposureByTicker.get(order.ticker) || 0) + order.notionalCents
      );
    }

    return { orders, rejected, projectedNotionalCents: openNotionalCents };
  }
}

module.exports = { Strategy, kellyFraction, resolveSide, buildClientOrderId };
