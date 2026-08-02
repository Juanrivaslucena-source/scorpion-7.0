#!/usr/bin/env node
/**
 * Kalshi Agent Tests
 *
 * Every test here runs offline. The client takes an injected fetch, the risk
 * limits take an injected fs, and the end-to-end run reads a fixture file, so
 * no network access and no credentials are required.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  buildAuthHeaders,
  buildSignatureMessage,
  signRequest,
  verifySignature,
  ACCESS_KEY_HEADER,
  ACCESS_TIMESTAMP_HEADER,
  ACCESS_SIGNATURE_HEADER
} = require('../lib/kalshi/signer');
const { KalshiClient, KalshiApiError } = require('../lib/kalshi/client');
const { normalizeMarket, probabilityToCents, hoursToClose } = require('../lib/kalshi/markets');
const {
  OrderbookSignal,
  quoteFromOrderbook,
  computeDepthWeightedMid
} = require('../lib/kalshi/signals/orderbook-signal');
const { NoArbSignal, findArbitrage } = require('../lib/kalshi/signals/no-arb-signal');
const {
  EventConsistencySignal,
  sumLegProbabilities
} = require('../lib/kalshi/signals/event-consistency-signal');
const { ProbabilityEngine } = require('../lib/kalshi/probability-engine');
const { LlmOverlay, blend, extractEstimates } = require('../lib/kalshi/llm-overlay');
const { RiskLimits } = require('../lib/kalshi/risk');
const { Strategy, kellyFraction, buildClientOrderId } = require('../lib/kalshi/strategy');
const { Broker, resolveMode, toApiPayload, TradingGateError, MODES } = require('../lib/kalshi/paper-broker');

// Ambient Kalshi configuration would make these assertions depend on the shell
// they run in. Clear it so every test exercises explicit options and defaults.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('KALSHI_')) {
    delete process.env[key];
  }
}
delete process.env.ANTHROPIC_API_KEY;

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'kalshi-markets.json');
const DOLLARS_FIXTURE_PATH = path.join(__dirname, 'fixtures', 'kalshi-market-dollars.json');

const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
const imbalancedRaw = fixture.markets.find(m => m.ticker === 'TEST-IMBALANCED');
const arbRaw = fixture.markets.find(m => m.ticker === 'TEST-ARB');
const illiquidRaw = fixture.markets.find(m => m.ticker === 'TEST-ILLIQUID');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs1', format: 'pem' });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' });

/**
 * Build a minimal stub of the fetch Response interface
 * @param {number} status - HTTP status
 * @param {Object|string} body - Response body
 * @param {Object} [headers] - Response headers
 * @returns {Object} Response-like object
 */
function stubResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => body
  };
}

describe('Signer', () => {
  it('signs and verifies a round trip', () => {
    const message = buildSignatureMessage(1700000000000, 'GET', '/trade-api/v2/markets');
    const signature = signRequest(message, PRIVATE_PEM);

    assert.strictEqual(verifySignature(message, signature, PUBLIC_PEM), true);
  });

  it('rejects a signature over a different message', () => {
    const signature = signRequest(
      buildSignatureMessage(1700000000000, 'GET', '/trade-api/v2/markets'),
      PRIVATE_PEM
    );
    const other = buildSignatureMessage(1700000000000, 'POST', '/trade-api/v2/markets');

    assert.strictEqual(verifySignature(other, signature, PUBLIC_PEM), false);
  });

  it('includes the /trade-api/v2 prefix and excludes the query string', () => {
    const message = buildSignatureMessage(
      1700000000000,
      'get',
      '/trade-api/v2/markets?status=open&limit=100'
    );

    assert.strictEqual(message, '1700000000000GET/trade-api/v2/markets');
    assert.ok(message.includes('/trade-api/v2'));
    assert.ok(!message.includes('status=open'));
  });

  it('upcases the HTTP method', () => {
    assert.ok(buildSignatureMessage(1, 'post', '/trade-api/v2/x').includes('POST'));
  });

  it('rejects a relative path', () => {
    assert.throws(() => buildSignatureMessage(1, 'GET', 'markets'), /absolute/);
  });

  it('builds all three auth headers', () => {
    const headers = buildAuthHeaders({
      keyId: 'key-123',
      privateKeyPem: PRIVATE_PEM,
      method: 'GET',
      path: '/trade-api/v2/portfolio/balance',
      now: 1700000000000
    });

    assert.strictEqual(headers[ACCESS_KEY_HEADER], 'key-123');
    assert.strictEqual(headers[ACCESS_TIMESTAMP_HEADER], '1700000000000');
    assert.ok(headers[ACCESS_SIGNATURE_HEADER].length > 0);

    // The header's signature must verify against the message the server rebuilds.
    const expected = buildSignatureMessage(1700000000000, 'GET', '/trade-api/v2/portfolio/balance');
    assert.strictEqual(
      verifySignature(expected, headers[ACCESS_SIGNATURE_HEADER], PUBLIC_PEM),
      true
    );
  });

  it('requires a key ID', () => {
    assert.throws(
      () => buildAuthHeaders({ privateKeyPem: PRIVATE_PEM, method: 'GET', path: '/x' }),
      /key ID/
    );
  });
});

describe('Market normalization', () => {
  it('produces identical output from cents-integer and dollars-string forms', () => {
    const fromCents = normalizeMarket(imbalancedRaw);
    const fromDollars = normalizeMarket(
      JSON.parse(fs.readFileSync(DOLLARS_FIXTURE_PATH, 'utf8'))
    );

    for (const field of [
      'ticker',
      'yesBid',
      'yesAsk',
      'noBid',
      'noAsk',
      'lastPrice',
      'volume',
      'volume24h',
      'openInterest',
      'yesMidCents',
      'spreadCents',
      'marketProbability'
    ]) {
      assert.deepStrictEqual(
        fromCents[field],
        fromDollars[field],
        `Field "${field}" differs between the two field families`
      );
    }
  });

  it('turns missing fields into null rather than zero', () => {
    const market = normalizeMarket({ ticker: 'BARE' });

    assert.strictEqual(market.yesBid, null);
    assert.strictEqual(market.volume24h, null);
    assert.strictEqual(market.marketProbability, null);
    assert.strictEqual(market.spreadCents, null);
  });

  it('preserves a genuine zero', () => {
    const market = normalizeMarket({ ticker: 'ZERO', volume_24h: 0 });
    assert.strictEqual(market.volume24h, 0);
  });

  it('derives the mid and spread from a two-sided quote', () => {
    const market = normalizeMarket(imbalancedRaw);

    assert.strictEqual(market.yesMidCents, 43);
    assert.strictEqual(market.spreadCents, 6);
    assert.strictEqual(market.marketProbability, 0.43);
  });

  it('falls back to the last price when there is no book', () => {
    const market = normalizeMarket({ ticker: 'LAST', last_price: 37 });
    assert.strictEqual(market.marketProbability, 0.37);
  });

  it('clamps probabilities to the tradeable 1-99 cent range', () => {
    assert.strictEqual(probabilityToCents(0), 1);
    assert.strictEqual(probabilityToCents(1), 99);
    assert.strictEqual(probabilityToCents(0.425), 43);
  });

  it('returns null hours-to-close when the close time is unknown', () => {
    assert.strictEqual(hoursToClose(normalizeMarket({ ticker: 'X' })), null);
  });
});

describe('Orderbook signal', () => {
  it('derives the YES ask from the best NO bid', () => {
    const quote = quoteFromOrderbook({ yes: [[40, 900]], no: [[54, 20]] });

    assert.strictEqual(quote.yesBid, 40);
    assert.strictEqual(quote.yesAsk, 46);
  });

  it('pulls the microprice toward the thinner side', () => {
    // 900 resting on the bid against 20 on the ask: the ask is about to be
    // taken, so fair value sits well above the 43c midpoint.
    const micro = computeDepthWeightedMid({
      yesBid: 40,
      yesAsk: 46,
      yesBidSize: 900,
      yesAskSize: 20
    });

    assert.ok(micro > 43, `Expected microprice above the 43c mid, got ${micro}`);
    assert.ok(micro < 46, `Microprice must stay inside the book, got ${micro}`);
  });

  it('falls back to the plain mid when the book has no size', () => {
    const micro = computeDepthWeightedMid({
      yesBid: 40,
      yesAsk: 46,
      yesBidSize: 0,
      yesAskSize: 0
    });

    assert.strictEqual(micro, 43);
  });

  it('returns no estimate for an empty book', async () => {
    const result = await new OrderbookSignal().evaluate({
      market: normalizeMarket(imbalancedRaw),
      orderbook: { yes: [], no: [] }
    });

    assert.strictEqual(result.probability, null);
    assert.match(result.reason, /one-sided or empty/i);
  });

  it('returns no estimate for a one-sided book', async () => {
    const result = await new OrderbookSignal().evaluate({
      market: normalizeMarket(imbalancedRaw),
      orderbook: { yes: [[40, 100]], no: [] }
    });

    assert.strictEqual(result.probability, null);
  });

  it('returns no estimate when the spread is too wide to trade', async () => {
    const result = await new OrderbookSignal({ maxSpreadCents: 4 }).evaluate({
      market: normalizeMarket(imbalancedRaw),
      orderbook: { yes: [[20, 100]], no: [[20, 100]] }
    });

    assert.strictEqual(result.probability, null);
    assert.match(result.reason, /spread/i);
  });

  it('returns no estimate when there is no book at all', async () => {
    const result = await new OrderbookSignal().evaluate({
      market: normalizeMarket(imbalancedRaw),
      orderbook: null
    });

    assert.strictEqual(result.probability, null);
  });
});

describe('No-arbitrage signal', () => {
  it('fires when the two bids sum above 100', () => {
    const violation = findArbitrage(normalizeMarket(arbRaw));

    assert.ok(violation, 'Expected an arbitrage on bids summing to 105');
    assert.strictEqual(violation.type, 'sell-both');
    assert.strictEqual(violation.edgeCents, 5);
    assert.strictEqual(violation.legs.length, 2);
  });

  it('stays silent when the bound holds', () => {
    assert.strictEqual(findArbitrage(normalizeMarket(imbalancedRaw)), null);
  });

  it('stays silent when a bid is missing', () => {
    assert.strictEqual(findArbitrage(normalizeMarket({ ticker: 'X', yes_bid: 60 })), null);
  });

  it('never contributes a directional probability', async () => {
    // Capturing the arbitrage needs both legs; a single leg is an ordinary
    // directional position, so this must not feed the sizing calculation.
    const result = await new NoArbSignal().evaluate({ market: normalizeMarket(arbRaw) });

    assert.strictEqual(result.probability, null);
    assert.strictEqual(result.weight, 0);
    assert.ok(result.arbitrage);
    assert.strictEqual(result.arbitrage.edgeCents, 5);
  });
});

describe('Event consistency signal', () => {
  const legs = [
    normalizeMarket({ ticker: 'A', yes_bid: 49, yes_ask: 51 }),
    normalizeMarket({ ticker: 'B', yes_bid: 39, yes_ask: 41 }),
    normalizeMarket({ ticker: 'C', yes_bid: 29, yes_ask: 31 })
  ];

  it('sums leg probabilities', () => {
    assert.strictEqual(Number(sumLegProbabilities(legs).toFixed(2)), 1.2);
  });

  it('returns null when a leg has no price', () => {
    assert.strictEqual(
      sumLegProbabilities([...legs, normalizeMarket({ ticker: 'D' })]),
      null
    );
  });

  it('normalizes an overpriced leg set', async () => {
    const result = await new EventConsistencySignal().evaluate({
      market: legs[0],
      siblings: legs,
      mutuallyExclusive: true
    });

    // Legs sum to 1.20, so leg A's consistent value is 0.50 / 1.20.
    assert.ok(result.probability !== null);
    assert.strictEqual(Number(result.probability.toFixed(4)), 0.4167);
  });

  it('stays silent unless mutual exclusivity is confirmed', async () => {
    const result = await new EventConsistencySignal().evaluate({
      market: legs[0],
      siblings: legs,
      mutuallyExclusive: false
    });

    assert.strictEqual(result.probability, null);
    assert.match(result.reason, /mutually exclusive/i);
  });

  it('refuses a leg set too far from 1 to be a pricing error', async () => {
    const wild = [
      normalizeMarket({ ticker: 'A', yes_bid: 89, yes_ask: 91 }),
      normalizeMarket({ ticker: 'B', yes_bid: 89, yes_ask: 91 })
    ];

    const result = await new EventConsistencySignal().evaluate({
      market: wild[0],
      siblings: wild,
      mutuallyExclusive: true
    });

    assert.strictEqual(result.probability, null);
    assert.match(result.reason, /too far off/i);
  });

  it('stays silent when the legs already sum close to 1', async () => {
    const tight = [
      normalizeMarket({ ticker: 'A', yes_bid: 59, yes_ask: 61 }),
      normalizeMarket({ ticker: 'B', yes_bid: 39, yes_ask: 41 })
    ];

    const result = await new EventConsistencySignal().evaluate({
      market: tight[0],
      siblings: tight,
      mutuallyExclusive: true
    });

    assert.strictEqual(result.probability, null);
    assert.match(result.reason, /within tolerance/i);
  });
});

describe('Probability engine', () => {
  const engine = new ProbabilityEngine({
    minVolume24h: 500,
    minOpenInterest: 500,
    maxSpreadCents: 6,
    minHoursToClose: 2
  });

  it('rejects an illiquid market before estimating anything', () => {
    const verdict = engine.checkLiquidity(normalizeMarket(illiquidRaw));

    assert.strictEqual(verdict.tradeable, false);
    assert.ok(verdict.reasons.some(reason => /volume/i.test(reason)));
    assert.ok(verdict.reasons.some(reason => /open interest/i.test(reason)));
    assert.ok(verdict.reasons.some(reason => /spread/i.test(reason)));
  });

  it('accepts a liquid market', () => {
    assert.strictEqual(engine.checkLiquidity(normalizeMarket(imbalancedRaw)).tradeable, true);
  });

  it('rejects a market that closes too soon', () => {
    const soon = normalizeMarket({
      ...imbalancedRaw,
      close_time: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    });

    assert.ok(engine.checkLiquidity(soon).reasons.some(reason => /Closes in/.test(reason)));
  });

  it('ignores zero-weight signals when combining', () => {
    const combined = engine.combine([
      { probability: 0.5, weight: 0 },
      { probability: 0.8, weight: 2 }
    ]);

    assert.strictEqual(combined.probability, 0.8);
  });

  it('weights contributing signals', () => {
    const combined = engine.combine([
      { probability: 0.4, weight: 1 },
      { probability: 0.6, weight: 3 }
    ]);

    assert.strictEqual(Number(combined.probability.toFixed(4)), 0.55);
  });

  it('returns a null probability when nothing contributes', () => {
    assert.strictEqual(engine.combine([{ probability: null, weight: 1 }]).probability, null);
  });

  it('scores the fixture and separates arbitrage from candidates', async () => {
    const markets = fixture.markets.map(normalizeMarket);
    const orderbooks = new Map(Object.entries(fixture.orderbooks));

    const { candidates, skipped, arbitrage } = await engine.run(markets, { orderbooks });

    assert.ok(candidates.some(c => c.ticker === 'TEST-IMBALANCED'));
    assert.ok(skipped.some(s => s.ticker === 'TEST-ILLIQUID'));
    assert.strictEqual(arbitrage.length, 1);
    assert.strictEqual(arbitrage[0].ticker, 'TEST-ARB');

    const imbalanced = candidates.find(c => c.ticker === 'TEST-IMBALANCED');
    assert.ok(
      imbalanced.fairProbability > imbalanced.marketProbability,
      'Bid-heavy book should price above the midpoint'
    );
    assert.strictEqual(imbalanced.side, 'yes');
  });
});

describe('Risk limits', () => {
  const noHalt = { existsSync: () => false };

  /**
   * Build a RiskLimits instance with a stubbed filesystem
   * @param {Object} [overrides] - Constructor overrides
   * @returns {RiskLimits} Configured limits
   */
  function limits(overrides = {}) {
    return new RiskLimits({
      maxContractsPerOrder: 50,
      maxNotionalPerMarketCents: 5000,
      maxTotalOpenNotionalCents: 25000,
      minEdgeCents: 4,
      dailyLossCapCents: 5000,
      fsImpl: noHalt,
      ...overrides
    });
  }

  const order = { ticker: 'T', count: 10, priceCents: 40, edgeCents: 6 };

  it('allows an order inside every limit', () => {
    assert.strictEqual(limits().check(order, {}).allowed, true);
  });

  it('rejects an oversized order', () => {
    const verdict = limits().check({ ...order, count: 500 }, {});

    assert.strictEqual(verdict.allowed, false);
    assert.ok(verdict.violations.some(v => /per-order maximum/.test(v)));
  });

  it('rejects an order below the minimum edge', () => {
    const verdict = limits().check({ ...order, edgeCents: 1 }, {});

    assert.strictEqual(verdict.allowed, false);
    assert.ok(verdict.violations.some(v => /below the 4c minimum/.test(v)));
  });

  it('rejects an order breaching the per-market cap', () => {
    const verdict = limits().check(order, {
      exposureByTicker: new Map([['T', 4900]])
    });

    assert.strictEqual(verdict.allowed, false);
    assert.ok(verdict.violations.some(v => /per-market cap/.test(v)));
  });

  it('rejects an order breaching the total exposure cap', () => {
    const verdict = limits().check(order, { openNotionalCents: 24900 });

    assert.strictEqual(verdict.allowed, false);
    assert.ok(verdict.violations.some(v => /Total exposure/.test(v)));
  });

  it('rejects an order larger than the available balance', () => {
    const verdict = limits().check(order, { balanceCents: 100 });

    assert.strictEqual(verdict.allowed, false);
    assert.ok(verdict.violations.some(v => /is available/.test(v)));
  });

  it('rejects a price outside the tradeable range', () => {
    assert.strictEqual(limits().check({ ...order, priceCents: 0 }, {}).allowed, false);
    assert.strictEqual(limits().check({ ...order, priceCents: 100 }, {}).allowed, false);
  });

  it('rejects a non-positive count', () => {
    assert.strictEqual(limits().check({ ...order, count: 0 }, {}).allowed, false);
  });

  it('halts everything when the kill switch is present', () => {
    const verdict = limits({ fsImpl: { existsSync: () => true } }).preflight({});

    assert.strictEqual(verdict.allowed, false);
    assert.ok(verdict.violations.some(v => /Kill switch/.test(v)));
  });

  it('fails closed when the kill-switch state cannot be read', () => {
    const unreadable = {
      existsSync: () => {
        throw new Error('EACCES');
      }
    };

    assert.strictEqual(limits({ fsImpl: unreadable }).isHalted(), true);
  });

  it('halts when the daily loss cap is reached', () => {
    const verdict = limits().preflight({ realizedPnlTodayCents: -5000 });

    assert.strictEqual(verdict.allowed, false);
    assert.ok(verdict.violations.some(v => /Daily loss/.test(v)));
  });

  it('allows trading below the daily loss cap', () => {
    assert.strictEqual(limits().preflight({ realizedPnlTodayCents: -4000 }).allowed, true);
  });

  it('halts on a zero balance', () => {
    assert.strictEqual(limits().preflight({ balanceCents: 0 }).allowed, false);
  });
});

describe('Strategy', () => {
  const riskLimits = new RiskLimits({
    maxContractsPerOrder: 50,
    maxNotionalPerMarketCents: 5000,
    maxTotalOpenNotionalCents: 25000,
    minEdgeCents: 4,
    fsImpl: { existsSync: () => false }
  });

  /**
   * Build a scored candidate for sizing tests
   * @param {Object} raw - Raw market
   * @param {number} fairProbability - Believed probability
   * @returns {Object} Candidate
   */
  function candidateFor(raw, fairProbability) {
    const market = normalizeMarket(raw);
    const edge = fairProbability - market.marketProbability;

    return {
      ticker: market.ticker,
      market,
      marketProbability: market.marketProbability,
      fairProbability,
      edge,
      edgeCents: Number((edge * 100).toFixed(2)),
      side: edge >= 0 ? 'yes' : 'no'
    };
  }

  it('computes the Kelly fraction for a binary contract', () => {
    // f* = (q - p) / (1 - p)
    assert.strictEqual(Number(kellyFraction(0.6, 0.5).toFixed(4)), 0.2);
    assert.strictEqual(kellyFraction(0.4, 0.5), 0, 'No edge means no stake');
    assert.strictEqual(kellyFraction(0.6, 1), 0, 'A certainty-priced contract is unstakeable');
  });

  it('sizes a passive entry against the bid', () => {
    const strategy = new Strategy({ riskLimits, entryStyle: 'passive' });
    const order = strategy.sizeCandidate(candidateFor(imbalancedRaw, 0.4587), {
      bankrollCents: 100000,
      runId: 'run-1'
    });

    assert.ok(order, 'Expected an order from a passive entry');
    assert.strictEqual(order.side, 'yes');
    assert.strictEqual(order.priceCents, 40, 'Passive entry posts at the bid');
    assert.strictEqual(order.yes_price, 40);
    assert.ok(order.edgeCents > 4);
  });

  it('produces no order when crossing the spread wipes out the edge', () => {
    // A book-derived estimate can never exceed the ask, so an aggressive entry
    // on the same candidate must find no edge left.
    const strategy = new Strategy({ riskLimits, entryStyle: 'aggressive' });
    const order = strategy.sizeCandidate(candidateFor(imbalancedRaw, 0.4587), {
      bankrollCents: 100000,
      runId: 'run-1'
    });

    assert.strictEqual(order, null);
  });

  it('clamps size to the per-order maximum', () => {
    const strategy = new Strategy({ riskLimits, kellyFraction: 1, maxBankrollFraction: 1 });
    const order = strategy.sizeCandidate(candidateFor(imbalancedRaw, 0.8), {
      bankrollCents: 10000000,
      runId: 'run-1'
    });

    assert.strictEqual(order.count, 50);
  });

  it('produces no order when spread capture alone misses the minimum edge', () => {
    // Fair 0.425 against a 0.43 market means buying NO. The NO bid is 54c and
    // NO is worth 57.5c, so the passive edge is 3.5c — real, but under the 4c
    // floor, so it must not produce an order.
    const strategy = new Strategy({ riskLimits });
    const order = strategy.sizeCandidate(candidateFor(imbalancedRaw, 0.425), {
      bankrollCents: 100000,
      runId: 'run-1'
    });

    assert.strictEqual(order, null);
  });

  it('produces no order when the bankroll rounds size to zero', () => {
    const strategy = new Strategy({ riskLimits });
    const order = strategy.sizeCandidate(candidateFor(imbalancedRaw, 0.4587), {
      bankrollCents: 10,
      runId: 'run-1'
    });

    assert.strictEqual(order, null);
  });

  it('buys NO when the market overprices YES', () => {
    const strategy = new Strategy({ riskLimits });
    const order = strategy.sizeCandidate(candidateFor(imbalancedRaw, 0.30), {
      bankrollCents: 100000,
      runId: 'run-1'
    });

    assert.ok(order);
    assert.strictEqual(order.side, 'no');
    assert.strictEqual(order.no_price, 54, 'Passive NO entry posts at the NO bid');
    assert.strictEqual(order.yes_price, undefined);
  });

  it('generates a stable client order ID across identical runs', () => {
    const first = buildClientOrderId('run-1', 'TICKER', 'yes');
    const second = buildClientOrderId('run-1', 'TICKER', 'yes');

    assert.strictEqual(first, second);
    assert.notStrictEqual(first, buildClientOrderId('run-2', 'TICKER', 'yes'));
    assert.notStrictEqual(first, buildClientOrderId('run-1', 'TICKER', 'no'));
  });

  it('accumulates exposure across a batch so caps apply to the whole run', () => {
    const strategy = new Strategy({
      riskLimits: new RiskLimits({
        maxContractsPerOrder: 50,
        maxNotionalPerMarketCents: 5000,
        maxTotalOpenNotionalCents: 2500,
        minEdgeCents: 4,
        fsImpl: { existsSync: () => false }
      })
    });

    const candidates = [
      candidateFor(imbalancedRaw, 0.4587),
      candidateFor({ ...imbalancedRaw, ticker: 'TEST-SECOND' }, 0.4587)
    ];

    const { orders, rejected } = strategy.buildOrders(candidates, {
      bankrollCents: 100000,
      runId: 'run-1'
    });

    assert.strictEqual(orders.length, 1, 'The second order should exceed the total cap');
    assert.strictEqual(rejected.length, 1);
    assert.ok(rejected[0].reasons.some(r => /Total exposure/.test(r)));
  });
});

describe('Kalshi client', () => {
  /**
   * Build a client with a scripted fetch implementation
   * @param {Array} responses - Responses to return in order
   * @param {Object} [options] - Extra client options
   * @returns {Object} { client, calls }
   */
  function scriptedClient(responses, options = {}) {
    const calls = [];
    let index = 0;

    const client = new KalshiClient({
      env: 'demo',
      keyId: 'key-1',
      privateKeyPem: PRIVATE_PEM,
      maxRetries: 2,
      sleep: async () => {},
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return responses[Math.min(index++, responses.length - 1)];
      },
      ...options
    });

    return { client, calls };
  }

  it('rejects an unknown environment', () => {
    assert.throws(() => new KalshiClient({ env: 'staging' }), /Unknown KALSHI_ENV/);
  });

  it('signs requests and keeps the query out of the signature', async () => {
    const { client, calls } = scriptedClient([stubResponse(200, { markets: [] })]);
    await client.request('GET', '/markets', { query: { status: 'open' } });

    const [{ url, init }] = calls;
    assert.ok(url.includes('demo-api.kalshi.co'));
    assert.ok(url.includes('status=open'));

    const expected = buildSignatureMessage(
      Number(init.headers[ACCESS_TIMESTAMP_HEADER]),
      'GET',
      '/trade-api/v2/markets'
    );
    assert.strictEqual(
      verifySignature(expected, init.headers[ACCESS_SIGNATURE_HEADER], PUBLIC_PEM),
      true
    );
  });

  it('retries a 429 and then succeeds', async () => {
    const { client, calls } = scriptedClient([
      stubResponse(429, { error: 'slow down' }, { 'retry-after': '0' }),
      stubResponse(429, { error: 'slow down' }, { 'retry-after': '0' }),
      stubResponse(200, { markets: [{ ticker: 'A' }] })
    ]);

    const result = await client.request('GET', '/markets');

    assert.strictEqual(calls.length, 3);
    assert.strictEqual(result.markets[0].ticker, 'A');
  });

  it('gives up after maxRetries on a persistent 500', async () => {
    const { client, calls } = scriptedClient([stubResponse(500, { error: 'boom' })]);

    await assert.rejects(() => client.request('GET', '/markets'), error => {
      assert.ok(error instanceof KalshiApiError);
      assert.strictEqual(error.status, 500);
      return true;
    });

    assert.strictEqual(calls.length, 3, 'One initial attempt plus two retries');
  });

  it('does not retry a 400', async () => {
    const { client, calls } = scriptedClient([stubResponse(400, { error: 'bad ticker' })]);

    await assert.rejects(() => client.request('GET', '/markets'));
    assert.strictEqual(calls.length, 1);
  });

  it('retries a network-level failure', async () => {
    let attempts = 0;
    const client = new KalshiClient({
      env: 'demo',
      maxRetries: 2,
      sleep: async () => {},
      fetchImpl: async () => {
        attempts++;
        throw new Error('ECONNRESET');
      }
    });

    await assert.rejects(() => client.request('GET', '/markets'));
    assert.strictEqual(attempts, 3);
  });

  it('refuses an authenticated endpoint without credentials', async () => {
    const client = new KalshiClient({ env: 'demo', fetchImpl: async () => stubResponse(200, {}) });

    assert.strictEqual(client.isAuthenticated(), false);
    await assert.rejects(() => client.getBalance(), /requires credentials/);
  });

  it('follows cursor pagination to exhaustion', async () => {
    let page = 0;
    const client = new KalshiClient({
      env: 'demo',
      fetchImpl: async () => {
        page++;
        return page === 1
          ? stubResponse(200, { markets: [{ ticker: 'A' }], cursor: 'next' })
          : stubResponse(200, { markets: [{ ticker: 'B' }], cursor: '' });
      }
    });

    const markets = await client.listAll('/markets', {}, 'markets');

    assert.deepStrictEqual(markets.map(m => m.ticker), ['A', 'B']);
  });
});

describe('LLM overlay', () => {
  const candidates = [
    {
      ticker: 'TEST-IMBALANCED',
      title: 'Test market',
      market: normalizeMarket(imbalancedRaw),
      marketProbability: 0.43,
      fairProbability: 0.46,
      edge: 0.03,
      edgeCents: 3,
      side: 'yes',
      liquidity: { hoursToClose: 100 }
    }
  ];

  it('is disabled without an API key and returns candidates untouched', async () => {
    const result = await new LlmOverlay({ apiKey: null }).refine(candidates);

    assert.strictEqual(result.applied, false);
    assert.strictEqual(result.candidates, candidates);
    assert.match(result.reason, /ANTHROPIC_API_KEY/);
  });

  it('falls back to the baseline when the request throws', async () => {
    const overlay = new LlmOverlay({
      apiKey: 'test-key',
      logger: () => {},
      fetchImpl: async () => {
        throw new Error('network down');
      }
    });

    const result = await overlay.refine(candidates);

    assert.strictEqual(result.applied, false);
    assert.strictEqual(result.candidates[0].fairProbability, 0.46);
  });

  it('falls back to the baseline on a safety refusal', async () => {
    const overlay = new LlmOverlay({
      apiKey: 'test-key',
      logger: () => {},
      fetchImpl: async () => stubResponse(200, { stop_reason: 'refusal', content: [] })
    });

    const result = await overlay.refine(candidates);

    assert.strictEqual(result.applied, false);
    assert.strictEqual(result.candidates[0].fairProbability, 0.46);
  });

  it('falls back to the baseline on a non-2xx response', async () => {
    const overlay = new LlmOverlay({
      apiKey: 'test-key',
      logger: () => {},
      fetchImpl: async () => stubResponse(400, { error: { message: 'bad request' } })
    });

    assert.strictEqual((await overlay.refine(candidates)).applied, false);
  });

  it('falls back to the baseline on unparseable content', async () => {
    const overlay = new LlmOverlay({
      apiKey: 'test-key',
      logger: () => {},
      fetchImpl: async () =>
        stubResponse(200, { stop_reason: 'end_turn', content: [{ type: 'text', text: 'oops' }] })
    });

    assert.strictEqual((await overlay.refine(candidates)).applied, false);
  });

  it('blends a valid estimate into the baseline', async () => {
    const overlay = new LlmOverlay({
      apiKey: 'test-key',
      logger: () => {},
      fetchImpl: async () =>
        stubResponse(200, {
          stop_reason: 'end_turn',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                estimates: [
                  {
                    ticker: 'TEST-IMBALANCED',
                    probability: 0.7,
                    confidence: 'high',
                    rationale: 'because'
                  }
                ]
              })
            }
          ]
        })
    });

    const result = await overlay.refine(candidates);

    assert.strictEqual(result.applied, true);
    // High confidence caps at weight 0.5: 0.5 * 0.7 + 0.5 * 0.46 = 0.58
    assert.strictEqual(Number(result.candidates[0].fairProbability.toFixed(4)), 0.58);
    assert.strictEqual(result.candidates[0].llm.weight, 0.5);
  });

  it('never lets the model outweigh the deterministic baseline', () => {
    const { weight } = blend(0.5, 0.99, 'high', 0.5);
    assert.ok(weight <= 0.5, 'The model must never carry more than half the weight');
  });

  it('sends no parameters that Opus 5 rejects', () => {
    const body = new LlmOverlay({ apiKey: 'test-key' }).buildRequestBody(candidates);

    assert.strictEqual(body.temperature, undefined);
    assert.strictEqual(body.top_p, undefined);
    assert.strictEqual(body.top_k, undefined);
    assert.strictEqual(body.thinking.budget_tokens, undefined);
    assert.strictEqual(body.thinking.type, 'adaptive');
    assert.strictEqual(body.model, 'claude-opus-5');
    assert.strictEqual(body.output_config.format.type, 'json_schema');
    assert.strictEqual(body.system[0].cache_control.type, 'ephemeral');
  });

  it('treats a refusal as unusable before reading content', () => {
    assert.strictEqual(
      extractEstimates({ stop_reason: 'refusal', content: [{ type: 'text', text: '{}' }] }),
      null
    );
  });
});

describe('Broker gating', () => {
  it('defaults to dry run without --place', () => {
    assert.strictEqual(resolveMode({ place: false, env: 'demo' }), MODES.DRY_RUN);
    assert.strictEqual(resolveMode({ place: false, env: 'prod' }), MODES.DRY_RUN);
  });

  it('paper trades on demo with --place', () => {
    assert.strictEqual(resolveMode({ place: true, env: 'demo' }), MODES.PAPER);
  });

  it('refuses production without the consent phrase', () => {
    assert.throws(() => resolveMode({ place: true, env: 'prod' }), TradingGateError);
    assert.throws(
      () => resolveMode({ place: true, env: 'prod', liveConsent: 'yes' }),
      TradingGateError
    );
    assert.throws(
      () => resolveMode({ place: true, env: 'prod', liveConsent: 'i_understand_real_money' }),
      TradingGateError,
      'The consent phrase must match exactly, including case'
    );
  });

  it('allows production only with the exact consent phrase', () => {
    assert.strictEqual(
      resolveMode({ place: true, env: 'prod', liveConsent: 'I_UNDERSTAND_REAL_MONEY' }),
      MODES.LIVE
    );
  });

  it('lets scan-only outrank --place and the consent phrase', () => {
    assert.strictEqual(
      resolveMode({
        place: true,
        env: 'prod',
        liveConsent: 'I_UNDERSTAND_REAL_MONEY',
        scanOnly: true
      }),
      MODES.DRY_RUN
    );
  });

  it('sends nothing in dry run', async () => {
    let created = 0;
    const broker = new Broker({
      client: { env: 'demo', createOrder: async () => ++created },
      riskLimits: new RiskLimits({ fsImpl: { existsSync: () => false } }),
      place: false,
      scanOnly: false,
      logger: () => {}
    });

    const result = await broker.placeOrders([
      { ticker: 'T', action: 'buy', side: 'yes', count: 1, priceCents: 40, edgeCents: 5 }
    ]);

    assert.strictEqual(created, 0);
    assert.strictEqual(result.placed.length, 0);
    assert.strictEqual(result.skipped.length, 1);
  });

  it('places orders on demo and reports failures individually', async () => {
    const sent = [];
    const broker = new Broker({
      client: {
        env: 'demo',
        createOrder: async order => {
          sent.push(order);
          if (order.ticker === 'BAD') {
            throw new Error('rejected by exchange');
          }
          return { order_id: 'o-1' };
        }
      },
      riskLimits: new RiskLimits({ fsImpl: { existsSync: () => false } }),
      place: true,
      scanOnly: false,
      logger: () => {}
    });

    const result = await broker.placeOrders([
      { ticker: 'GOOD', action: 'buy', side: 'yes', count: 1, priceCents: 40, edgeCents: 5 },
      { ticker: 'BAD', action: 'buy', side: 'yes', count: 1, priceCents: 40, edgeCents: 5 }
    ]);

    assert.strictEqual(result.placed.length, 1);
    assert.strictEqual(result.failed.length, 1);
    assert.match(result.failed[0].error, /rejected by exchange/);
  });

  it('blocks every order when the risk preflight fails', async () => {
    let created = 0;
    const broker = new Broker({
      client: { env: 'demo', createOrder: async () => ++created },
      riskLimits: new RiskLimits({ fsImpl: { existsSync: () => true } }),
      place: true,
      scanOnly: false,
      logger: () => {}
    });

    const result = await broker.placeOrders([
      { ticker: 'T', action: 'buy', side: 'yes', count: 1, priceCents: 40, edgeCents: 5 }
    ]);

    assert.strictEqual(created, 0);
    assert.strictEqual(result.preflight.allowed, false);
  });

  it('strips local bookkeeping fields from the wire payload', () => {
    const payload = toApiPayload({
      ticker: 'T',
      action: 'buy',
      side: 'yes',
      count: 10,
      type: 'limit',
      yes_price: 40,
      client_order_id: 'abc',
      priceCents: 40,
      notionalCents: 400,
      edgeCents: 5,
      entryStyle: 'passive',
      fairProbability: 0.5,
      marketProbability: 0.4
    });

    assert.deepStrictEqual(Object.keys(payload).sort(), [
      'action',
      'client_order_id',
      'count',
      'side',
      'ticker',
      'type',
      'yes_price'
    ]);
  });
});

describe('End-to-end offline run', () => {
  it('scans the fixture, writes a report, and places nothing', () => {
    const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalshi-e2e-'));

    // Scrub ambient configuration so the run depends only on the fixture.
    const env = { ...process.env, PATH: process.env.PATH };
    for (const key of Object.keys(env)) {
      if (key.startsWith('KALSHI_') || key === 'ANTHROPIC_API_KEY') {
        delete env[key];
      }
    }

    const stdout = execFileSync(
      process.execPath,
      [
        path.join(__dirname, '..', 'scripts', 'kalshi-agent.js'),
        '--fixture',
        FIXTURE_PATH,
        '--no-llm',
        '--report-dir',
        reportDir
      ],
      { encoding: 'utf8', env }
    );

    assert.match(stdout, /Scan completed/);

    const results = JSON.parse(
      fs.readFileSync(path.join(reportDir, 'scan-results.json'), 'utf8')
    );

    assert.strictEqual(results.mode, 'dry-run');
    assert.strictEqual(results.env, 'demo');
    assert.strictEqual(results.execution.placed.length, 0, 'A dry run must place nothing');
    assert.strictEqual(results.arbitrage.length, 1);
    assert.ok(results.candidates.length > 0);

    const orders = JSON.parse(fs.readFileSync(path.join(reportDir, 'orders.json'), 'utf8'));
    assert.strictEqual(orders.length, 1, 'Expected exactly one sized order from the fixture');
    assert.strictEqual(orders[0].ticker, 'TEST-IMBALANCED');
    assert.strictEqual(orders[0].side, 'yes');

    const markdown = fs.readFileSync(path.join(reportDir, 'scan-report.md'), 'utf8');
    assert.match(markdown, /# Kalshi Scan Report/);
    assert.match(markdown, /Arbitrage Opportunities/);

    fs.rmSync(reportDir, { recursive: true, force: true });
  });
});
