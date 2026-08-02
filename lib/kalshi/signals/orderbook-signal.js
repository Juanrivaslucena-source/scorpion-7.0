/**
 * Orderbook Signal
 *
 * Derives a fair probability from the resting order book rather than the last
 * trade. The last trade can be stale or a single odd-lot print; the book is
 * where the market's current opinion actually lives.
 *
 * Kalshi's book quotes BIDS on both sides. A resting NO bid at q cents is
 * economically an offer to sell YES at (100 - q) cents, so the YES ask is
 * derived rather than quoted:
 *
 *   yesBid = highest resting YES bid
 *   yesAsk = 100 - (highest resting NO bid)
 *
 * The estimate is a size-weighted microprice: when there is far more size
 * resting on the bid than the ask, the true value sits closer to the ask,
 * because the thin side is the one about to be consumed.
 */

const SIGNAL_ID = 'orderbook';

/**
 * Extract the best (highest) price and its resting size from one side of a book
 * @param {Array} levels - Array of [priceCents, count] pairs
 * @returns {Object} { price, size } with nulls when the side is empty
 */
function bestLevel(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    return { price: null, size: null };
  }

  let best = { price: null, size: null };

  for (const level of levels) {
    // Levels arrive as [price, count] tuples; tolerate object form too.
    const price = Array.isArray(level) ? Number(level[0]) : Number(level.price);
    const size = Array.isArray(level) ? Number(level[1]) : Number(level.count ?? level.size);

    if (!Number.isFinite(price)) {
      continue;
    }

    if (best.price === null || price > best.price) {
      best = { price, size: Number.isFinite(size) ? size : 0 };
    }
  }

  return best;
}

/**
 * Total resting size across every level of one side
 * @param {Array} levels - Array of [priceCents, count] pairs
 * @returns {number} Summed size
 */
function totalSize(levels) {
  if (!Array.isArray(levels)) {
    return 0;
  }

  return levels.reduce((sum, level) => {
    const size = Array.isArray(level) ? Number(level[1]) : Number(level.count ?? level.size);
    return sum + (Number.isFinite(size) ? size : 0);
  }, 0);
}

/**
 * Convert a raw Kalshi orderbook into a two-sided YES quote
 * @param {Object} orderbook - Raw orderbook with `yes` and `no` level arrays
 * @returns {Object} Quote with yesBid/yesAsk in cents and the resting sizes
 */
function quoteFromOrderbook(orderbook) {
  const yesLevels = (orderbook && orderbook.yes) || [];
  const noLevels = (orderbook && orderbook.no) || [];

  const bestYes = bestLevel(yesLevels);
  const bestNo = bestLevel(noLevels);

  return {
    yesBid: bestYes.price,
    yesBidSize: bestYes.size,
    // A NO bid at q is an offer to sell YES at 100 - q.
    yesAsk: bestNo.price === null ? null : 100 - bestNo.price,
    yesAskSize: bestNo.size,
    yesDepth: totalSize(yesLevels),
    noDepth: totalSize(noLevels)
  };
}

/**
 * Size-weighted microprice between the two sides of the book
 *
 * Weighting each price by the size resting on the OPPOSITE side pulls the
 * estimate toward whichever side is thinner and therefore likelier to trade.
 * @param {Object} quote - Quote from quoteFromOrderbook
 * @returns {number|null} Microprice in cents, or null without a two-sided quote
 */
function computeDepthWeightedMid(quote) {
  const { yesBid, yesAsk, yesBidSize, yesAskSize } = quote;

  if (yesBid === null || yesAsk === null) {
    return null;
  }

  const bidSize = Number.isFinite(yesBidSize) ? yesBidSize : 0;
  const askSize = Number.isFinite(yesAskSize) ? yesAskSize : 0;
  const totalDepth = bidSize + askSize;

  if (totalDepth <= 0) {
    return (yesBid + yesAsk) / 2;
  }

  return (yesBid * askSize + yesAsk * bidSize) / totalDepth;
}

class OrderbookSignal {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSpreadCents] - Spreads wider than this yield no estimate
   * @param {number} [options.weight] - Relative weight in the blended estimate
   */
  constructor(options = {}) {
    this.id = SIGNAL_ID;
    this.name = 'Orderbook Microprice';
    this.maxSpreadCents = options.maxSpreadCents ?? 10;
    this.weight = options.weight ?? 1.0;
  }

  /**
   * Estimate a fair probability from the market's order book
   * @param {Object} context
   * @param {Object} context.market - Canonical market
   * @param {Object} [context.orderbook] - Raw orderbook for the market
   * @returns {Object} Signal result; probability is null when no estimate is possible
   */
  async evaluate({ market, orderbook }) {
    if (!orderbook) {
      return this.#empty('No orderbook available');
    }

    const quote = quoteFromOrderbook(orderbook);

    if (quote.yesBid === null || quote.yesAsk === null) {
      return this.#empty('One-sided or empty book');
    }

    const spread = quote.yesAsk - quote.yesBid;

    if (spread > this.maxSpreadCents) {
      // A 30-cent-wide book has no meaningful mid. Reporting one would invent
      // an edge that evaporates the moment an order crosses it.
      return this.#empty(`Spread ${spread}c exceeds max ${this.maxSpreadCents}c`, {
        spreadCents: spread
      });
    }

    const microCents = computeDepthWeightedMid(quote);

    return {
      id: this.id,
      name: this.name,
      weight: this.weight,
      probability: microCents / 100,
      reason: null,
      detail: {
        ticker: market && market.ticker,
        yesBid: quote.yesBid,
        yesAsk: quote.yesAsk,
        spreadCents: spread,
        micropriceCents: Number(microCents.toFixed(2)),
        yesDepth: quote.yesDepth,
        noDepth: quote.noDepth
      }
    };
  }

  /**
   * Build a no-estimate result
   * @param {string} reason - Why no estimate was produced
   * @param {Object} [detail] - Extra context
   * @returns {Object} Signal result with a null probability
   */
  #empty(reason, detail = {}) {
    return {
      id: this.id,
      name: this.name,
      weight: this.weight,
      probability: null,
      reason,
      detail
    };
  }
}

module.exports = {
  OrderbookSignal,
  quoteFromOrderbook,
  computeDepthWeightedMid,
  bestLevel,
  totalSize
};
