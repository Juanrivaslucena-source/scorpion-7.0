/**
 * Kalshi Market Normalization
 *
 * The Kalshi market schema has drifted over time. Two field families are in
 * circulation and a single response can carry either:
 *
 *   legacy: yes_bid, yes_ask, last_price  -> integers, in cents (1-99)
 *           volume, volume_24h, open_interest -> integers
 *   newer:  yes_bid_dollars, last_price_dollars -> strings, in dollars ("0.42")
 *           volume_fp, volume_24h_fp, open_interest_fp -> fixed-point counts
 *
 * Everything downstream works in integer cents for prices and floats in [0, 1]
 * for probabilities, so all of that variation is collapsed here.
 *
 * A field that is absent or unparseable becomes null, never 0. A zero-cent bid
 * and a missing bid mean very different things to a sizing calculation.
 */

/**
 * Read a price field, accepting either an integer-cents or a dollars-string form
 * @param {Object} raw - Raw market object
 * @param {string} centsKey - Legacy key holding integer cents, e.g. 'yes_bid'
 * @param {string} dollarsKey - Newer key holding a dollars string, e.g. 'yes_bid_dollars'
 * @returns {number|null} Price in integer cents, or null when absent
 */
function readPriceCents(raw, centsKey, dollarsKey) {
  const cents = raw[centsKey];
  if (typeof cents === 'number' && Number.isFinite(cents)) {
    return Math.round(cents);
  }

  const dollars = raw[dollarsKey];
  if (dollars !== undefined && dollars !== null && dollars !== '') {
    const parsed = Number(dollars);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100);
    }
  }

  return null;
}

/**
 * Read a count field, accepting either the plain or the fixed-point form
 * @param {Object} raw - Raw market object
 * @param {string} key - Legacy key, e.g. 'volume'
 * @param {string} fpKey - Newer fixed-point key, e.g. 'volume_fp'
 * @returns {number|null} Count, or null when absent
 */
function readCount(raw, key, fpKey) {
  const plain = raw[key];
  if (typeof plain === 'number' && Number.isFinite(plain)) {
    return Math.round(plain);
  }

  // The _fp variants arrive as either numbers or numeric strings. Both are
  // contract counts once coerced; round rather than trusting an exact integer.
  const fp = raw[fpKey];
  if (fp !== undefined && fp !== null && fp !== '') {
    const parsed = Number(fp);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return null;
}

/**
 * Convert integer cents to a probability in [0, 1]
 * @param {number|null} cents - Price in cents
 * @returns {number|null} Probability, or null when the input is null
 */
function centsToProbability(cents) {
  return cents === null || cents === undefined ? null : cents / 100;
}

/**
 * Convert a probability in [0, 1] to integer cents, clamped to Kalshi's 1-99 range
 * @param {number} probability - Probability
 * @returns {number} Price in cents between 1 and 99
 */
function probabilityToCents(probability) {
  const cents = Math.round(probability * 100);
  return Math.min(99, Math.max(1, cents));
}

/**
 * Normalize a raw market object into the canonical shape used everywhere else
 * @param {Object} raw - Raw market object from the Kalshi API
 * @returns {Object} Canonical market
 */
function normalizeMarket(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('normalizeMarket requires a market object');
  }

  const yesBid = readPriceCents(raw, 'yes_bid', 'yes_bid_dollars');
  const yesAsk = readPriceCents(raw, 'yes_ask', 'yes_ask_dollars');
  const noBid = readPriceCents(raw, 'no_bid', 'no_bid_dollars');
  const noAsk = readPriceCents(raw, 'no_ask', 'no_ask_dollars');
  const lastPrice = readPriceCents(raw, 'last_price', 'last_price_dollars');

  const hasTwoSidedQuote = yesBid !== null && yesAsk !== null;
  const yesMidCents = hasTwoSidedQuote ? (yesBid + yesAsk) / 2 : null;
  const spreadCents = hasTwoSidedQuote ? yesAsk - yesBid : null;

  // Prefer the quoted mid; fall back to last trade only when there is no book.
  const referenceCents = yesMidCents !== null ? yesMidCents : lastPrice;

  return {
    ticker: raw.ticker || null,
    eventTicker: raw.event_ticker || null,
    seriesTicker: raw.series_ticker || null,
    title: raw.title || raw.subtitle || raw.yes_sub_title || null,
    status: raw.status || null,
    closeTime: raw.close_time || raw.expiration_time || null,

    yesBid,
    yesAsk,
    noBid,
    noAsk,
    lastPrice,

    volume: readCount(raw, 'volume', 'volume_fp'),
    volume24h: readCount(raw, 'volume_24h', 'volume_24h_fp'),
    openInterest: readCount(raw, 'open_interest', 'open_interest_fp'),

    yesMidCents,
    spreadCents,
    marketProbability: centsToProbability(referenceCents),

    raw
  };
}

/**
 * Normalize a list of raw markets, dropping any that fail to parse
 * @param {Array} rawMarkets - Raw market objects
 * @returns {Array} Canonical markets
 */
function normalizeMarkets(rawMarkets) {
  const normalized = [];

  for (const raw of rawMarkets || []) {
    try {
      normalized.push(normalizeMarket(raw));
    } catch {
      // A single malformed market should not abort a scan over hundreds.
      continue;
    }
  }

  return normalized;
}

/**
 * Hours remaining until a market closes
 * @param {Object} market - Canonical market
 * @param {number} [now] - Unix milliseconds
 * @returns {number|null} Hours to close, or null when the close time is unknown
 */
function hoursToClose(market, now = Date.now()) {
  if (!market.closeTime) {
    return null;
  }

  const closeMs = Date.parse(market.closeTime);
  if (!Number.isFinite(closeMs)) {
    return null;
  }

  return (closeMs - now) / (1000 * 60 * 60);
}

module.exports = {
  normalizeMarket,
  normalizeMarkets,
  centsToProbability,
  probabilityToCents,
  hoursToClose,
  readPriceCents,
  readCount
};
