#!/usr/bin/env node
/**
 * Kalshi Probability Agent
 *
 * Scans Kalshi markets, estimates a fair probability for each, finds the ones
 * the market appears to misprice, sizes positions, and optionally places
 * orders.
 *
 * Defaults are deliberately inert: without --place nothing is sent anywhere,
 * and with --place the target is Kalshi's demo (paper-trading) environment
 * unless production has been explicitly and separately unlocked.
 *
 * Usage:
 *   node scripts/kalshi-agent.js [options]
 *
 *   --place                Actually submit orders (default: dry run)
 *   --no-llm               Skip the Claude refinement pass
 *   --fixture <path>       Read markets from a JSON file instead of the network
 *   --top <n>              Order books to fetch and candidates to refine (default: 25)
 *   --min-edge <cents>     Override the minimum edge threshold
 *   --series <ticker>      Restrict the scan to one series
 *   --report-dir <path>    Output directory (default: kalshi-report)
 *
 * Environment variables:
 *   KALSHI_ENV               demo | prod (default: demo)
 *   KALSHI_API_KEY_ID        API key ID
 *   KALSHI_PRIVATE_KEY_PATH  Path to the RSA private key PEM
 *   KALSHI_ALLOW_LIVE        Must be I_UNDERSTAND_REAL_MONEY for production orders
 *   KALSHI_BANKROLL_CENTS    Override the bankroll used for sizing
 *   ANTHROPIC_API_KEY        Enables the probability overlay
 *
 * See lib/kalshi/risk.js and lib/kalshi/probability-engine.js for the full set
 * of tuning variables.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { KalshiClient } = require('../lib/kalshi/client');
const { normalizeMarkets } = require('../lib/kalshi/markets');
const { ProbabilityEngine } = require('../lib/kalshi/probability-engine');
const { LlmOverlay } = require('../lib/kalshi/llm-overlay');
const { RiskLimits } = require('../lib/kalshi/risk');
const { Strategy } = require('../lib/kalshi/strategy');
const { Broker, TradingGateError } = require('../lib/kalshi/paper-broker');
const { writeReport } = require('../lib/kalshi/report');

/**
 * Parse command-line arguments
 * @param {Array<string>} argv - Raw arguments
 * @returns {Object} Parsed options
 */
function parseArgs(argv) {
  const options = {
    place: false,
    llm: true,
    fixture: null,
    top: 25,
    minEdgeCents: null,
    series: null,
    reportDir: 'kalshi-report'
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case '--place':
        options.place = true;
        break;
      case '--no-llm':
        options.llm = false;
        break;
      case '--fixture':
        options.fixture = argv[++i];
        break;
      case '--top':
        options.top = parseInt(argv[++i], 10);
        break;
      case '--min-edge':
        options.minEdgeCents = parseFloat(argv[++i]);
        break;
      case '--series':
        options.series = argv[++i];
        break;
      case '--report-dir':
        options.reportDir = argv[++i];
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

/**
 * Load markets, order books, and events from a fixture file
 *
 * This is what makes the whole pipeline runnable and testable with no network
 * access and no credentials.
 * @param {string} fixturePath - Path to the fixture JSON
 * @returns {Object} { markets, orderbooks, events, balanceCents }
 */
function loadFixture(fixturePath) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const orderbooks = new Map(Object.entries(fixture.orderbooks || {}));
  const events = new Map(
    Object.entries(fixture.events || {}).map(([ticker, event]) => [
      ticker,
      {
        mutuallyExclusive: Boolean(event.mutuallyExclusive),
        markets: normalizeMarkets(event.markets || [])
      }
    ])
  );

  return {
    markets: normalizeMarkets(fixture.markets || []),
    orderbooks,
    events,
    balanceCents: Number.isFinite(fixture.balanceCents) ? fixture.balanceCents : 100000
  };
}

/**
 * Fetch markets and their order books from the exchange
 * @param {Object} client - KalshiClient
 * @param {Object} engine - ProbabilityEngine, used to pre-filter before fetching books
 * @param {Object} options - CLI options
 * @returns {Promise<Object>} { markets, orderbooks, events, balanceCents }
 */
async function loadFromExchange(client, engine, options) {
  console.log(`[1/5] Fetching markets from ${client.env}...`);

  const query = options.series ? { series_ticker: options.series } : {};
  const markets = normalizeMarkets(await client.getMarkets(query));

  console.log(`      ${markets.length} markets returned`);

  // Order books cost a request each and are rate-limited, so only fetch them
  // for markets that already clear the liquidity gates on their summary fields.
  const eligible = markets
    .filter(market => engine.checkLiquidity(market).tradeable)
    .slice(0, options.top);

  console.log(`[2/5] Fetching ${eligible.length} order books...`);

  const orderbooks = new Map();
  for (const market of eligible) {
    try {
      orderbooks.set(market.ticker, await client.getOrderbook(market.ticker));
    } catch (error) {
      console.log(`      ⚠️  ${market.ticker}: ${error.message}`);
    }
  }

  // Group markets by event so the consistency signal has its sibling legs.
  // Mutual exclusivity is only asserted when the exchange says so; guessing it
  // would produce confident nonsense on merely-related questions.
  const events = new Map();
  for (const market of markets) {
    if (!market.eventTicker) {
      continue;
    }

    if (!events.has(market.eventTicker)) {
      events.set(market.eventTicker, {
        markets: [],
        mutuallyExclusive: Boolean(market.raw && market.raw.mutually_exclusive)
      });
    }

    events.get(market.eventTicker).markets.push(market);
  }

  let balanceCents = parseInt(process.env.KALSHI_BANKROLL_CENTS || '0', 10);

  if (!balanceCents && client.isAuthenticated()) {
    try {
      const balance = await client.getBalance();
      balanceCents = balance.balance ?? 0;
    } catch (error) {
      console.log(`      ⚠️  Could not read balance: ${error.message}`);
    }
  }

  return { markets, orderbooks, events, balanceCents };
}

/**
 * Main entry point
 */
async function main() {
  const startTime = Date.now();
  const options = parseArgs(process.argv.slice(2));
  const runId = crypto.randomUUID();

  console.log('Kalshi probability agent');
  console.log('='.repeat(50));

  const riskLimits = new RiskLimits(
    options.minEdgeCents !== null ? { minEdgeCents: options.minEdgeCents } : {}
  );

  const engine = new ProbabilityEngine();
  const client = new KalshiClient();

  // Resolve the trading mode BEFORE doing any work. A run that is going to be
  // refused for missing consent should say so immediately, not after a minute
  // of scanning.
  let broker;
  try {
    broker = new Broker({ client, riskLimits, place: options.place });
  } catch (error) {
    if (error instanceof TradingGateError) {
      console.error(`\n❌ ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  console.log(`Mode: ${broker.describe()}`);
  console.log('');

  const source = options.fixture
    ? loadFixture(options.fixture)
    : await loadFromExchange(client, engine, options);

  if (options.fixture) {
    console.log(`[1/5] Loaded ${source.markets.length} markets from ${options.fixture}`);
    console.log('[2/5] Order books loaded from fixture');
  }

  console.log('[3/5] Scoring markets...');
  const { candidates, skipped, arbitrage } = await engine.run(source.markets, {
    orderbooks: source.orderbooks,
    events: source.events
  });
  console.log(`      ${candidates.length} candidates, ${skipped.length} skipped`);

  if (arbitrage.length > 0) {
    // Not traded here: capturing these needs both legs to fill simultaneously,
    // and this agent places single-leg orders.
    console.log(`      ${arbitrage.length} arbitrage opportunities (reported, not traded)`);
  }

  console.log('[4/5] Refining probabilities...');
  const overlay = new LlmOverlay({ topN: options.top });
  const llmResult = options.llm
    ? await overlay.refine(candidates)
    : { candidates, applied: false, reason: 'Disabled with --no-llm' };
  console.log(`      ${llmResult.reason}`);

  console.log('[5/5] Sizing and placing orders...');
  const strategy = new Strategy({ riskLimits });
  const bankrollCents = source.balanceCents;

  if (!bankrollCents) {
    console.log('      ⚠️  Bankroll is zero; no orders can be sized.');
    console.log('         Set KALSHI_BANKROLL_CENTS or configure API credentials.');
  }

  const { orders, rejected } = strategy.buildOrders(llmResult.candidates, {
    bankrollCents,
    runId,
    portfolio: {}
  });

  console.log(`      ${orders.length} orders sized, ${rejected.length} rejected`);

  const execution = await broker.placeOrders(orders, { balanceCents: bankrollCents });

  const results = {
    runId,
    generatedAt: new Date().toISOString(),
    env: client.env,
    mode: broker.mode,
    bankrollCents,
    candidates: llmResult.candidates,
    skipped,
    arbitrage,
    orders,
    rejected,
    execution: {
      mode: execution.mode,
      placed: execution.placed.map(entry => ({
        ticker: entry.order.ticker,
        side: entry.order.side,
        count: entry.order.count,
        priceCents: entry.order.priceCents,
        result: entry.result
      })),
      failed: execution.failed,
      skipped: execution.skipped.map(entry => ({
        ticker: entry.order.ticker,
        reason: entry.reason
      }))
    },
    llm: { applied: llmResult.applied, reason: llmResult.reason },
    limits: riskLimits.describe()
  };

  writeReport(results, { reportDir: options.reportDir });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('='.repeat(50));
  console.log(`Scan completed in ${elapsed}s`);
  console.log(`Report: ${path.resolve(options.reportDir)}`);
  console.log('');

  if (execution.failed.length > 0) {
    console.log(`❌ ${execution.failed.length} orders failed to place`);
    process.exit(1);
  }

  const orderCount = `${orders.length} order${orders.length === 1 ? '' : 's'}`;

  if (candidates.length === 0) {
    console.log('✅ Scan complete. No mispriced markets found.');
  } else if (execution.placed.length > 0) {
    console.log(`✅ Scan complete. ${execution.placed.length} of ${orderCount} placed.`);
  } else {
    console.log(`✅ Scan complete. ${orderCount} sized; none placed (${broker.describe()}).`);
  }

  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Agent failed:', error);
    process.exit(1);
  });
}

module.exports = { main, parseArgs, loadFixture };
