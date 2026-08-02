/**
 * Event Consistency Signal
 *
 * Many Kalshi events decompose into a set of mutually exclusive, collectively
 * exhaustive markets — "which candidate wins", "which range does CPI land in".
 * Exactly one leg settles YES, so the leg probabilities must sum to 1.
 *
 * In practice they rarely do. A set summing to 1.08 means the legs are
 * collectively overpriced by 8%; the internally consistent fair value for each
 * leg is its normalized share of the total.
 *
 * This only holds when the legs really are mutually exclusive and exhaustive.
 * Applying it to an event that is merely a grouping of related questions
 * produces confident nonsense, so it stays off unless the caller explicitly
 * confirms the structure.
 */

const SIGNAL_ID = 'event-consistency';

/**
 * Sum the market-implied probabilities across a set of legs
 * @param {Array} legs - Canonical markets
 * @returns {number|null} Total probability, or null when any leg lacks a price
 */
function sumLegProbabilities(legs) {
  let total = 0;

  for (const leg of legs) {
    if (leg.marketProbability === null || leg.marketProbability === undefined) {
      // A partial sum understates the total and would invent an edge on every
      // remaining leg, so bail rather than guess.
      return null;
    }
    total += leg.marketProbability;
  }

  return total;
}

/**
 * Normalize a leg's probability to its share of the event total
 * @param {number} legProbability - The leg's market-implied probability
 * @param {number} total - Sum across all legs
 * @returns {number|null} Normalized probability, or null when the total is degenerate
 */
function normalizeLeg(legProbability, total) {
  if (!Number.isFinite(total) || total <= 0) {
    return null;
  }

  return legProbability / total;
}

class EventConsistencySignal {
  /**
   * @param {Object} [options]
   * @param {number} [options.minDeviation] - Minimum |sum - 1| worth acting on
   * @param {number} [options.maxDeviation] - Above this, treat the set as malformed
   * @param {number} [options.weight] - Relative weight in the blended estimate
   */
  constructor(options = {}) {
    this.id = SIGNAL_ID;
    this.name = 'Event Consistency';
    this.minDeviation = options.minDeviation ?? 0.02;
    // A set summing to 1.6 is far more likely to be mis-grouped than to be a
    // 60% free lunch. Refuse to draw conclusions from it.
    this.maxDeviation = options.maxDeviation ?? 0.35;
    this.weight = options.weight ?? 2.0;
  }

  /**
   * Estimate a leg's fair probability from its event's internal consistency
   * @param {Object} context
   * @param {Object} context.market - Canonical market (the leg being priced)
   * @param {Array} [context.siblings] - Every leg of the event, including this one
   * @param {boolean} [context.mutuallyExclusive] - Whether the legs are MECE
   * @returns {Object} Signal result; probability is null when inapplicable
   */
  async evaluate({ market, siblings, mutuallyExclusive }) {
    if (!mutuallyExclusive) {
      return this.#empty('Event is not confirmed mutually exclusive and exhaustive');
    }

    const legs = siblings || [];

    if (legs.length < 2) {
      return this.#empty('Event has fewer than two legs');
    }

    const total = sumLegProbabilities(legs);

    if (total === null) {
      return this.#empty('At least one leg has no tradeable price');
    }

    const deviation = Math.abs(total - 1);

    if (deviation < this.minDeviation) {
      return this.#empty(`Legs sum to ${total.toFixed(3)}, within tolerance`, { total });
    }

    if (deviation > this.maxDeviation) {
      return this.#empty(
        `Legs sum to ${total.toFixed(3)}, too far off to be a pricing error`,
        { total }
      );
    }

    if (market.marketProbability === null) {
      return this.#empty('Target leg has no tradeable price', { total });
    }

    const normalized = normalizeLeg(market.marketProbability, total);

    if (normalized === null) {
      return this.#empty('Event total is degenerate', { total });
    }

    return {
      id: this.id,
      name: this.name,
      weight: this.weight,
      probability: normalized,
      reason: null,
      detail: {
        ticker: market.ticker,
        eventTicker: market.eventTicker,
        legCount: legs.length,
        legSum: Number(total.toFixed(4)),
        deviation: Number(deviation.toFixed(4)),
        marketProbability: market.marketProbability,
        normalizedProbability: Number(normalized.toFixed(4))
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

module.exports = { EventConsistencySignal, sumLegProbabilities, normalizeLeg };
