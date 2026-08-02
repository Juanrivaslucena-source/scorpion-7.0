/**
 * Risk Limits
 *
 * Hard bounds applied to every order before it can reach the exchange. These
 * are deliberately conservative and deliberately dumb: they do not reason about
 * whether an order is good, only about whether its worst case is survivable.
 *
 * Two layers:
 *   preflight()  Run-level gates. A tripped kill switch or a breached daily
 *                loss cap stops the entire run, before any order is considered.
 *   check()      Per-order gates. Size, per-market notional, total exposure,
 *                and minimum edge.
 *
 * Everything here is pure apart from the kill-switch file read, so the whole
 * surface is unit-testable without network or credentials.
 *
 * Environment variables:
 *   KALSHI_MAX_CONTRACTS_PER_ORDER  Contracts in a single order (default: 50)
 *   KALSHI_MAX_MARKET_NOTIONAL      Per-market exposure in cents (default: 5000)
 *   KALSHI_MAX_TOTAL_NOTIONAL       Total open exposure in cents (default: 25000)
 *   KALSHI_MIN_EDGE_CENTS           Minimum edge to trade (default: 4)
 *   KALSHI_DAILY_LOSS_CAP_CENTS     Realized loss that halts trading (default: 5000)
 *   KALSHI_KILL_SWITCH_PATH         Presence of this file halts trading
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_KILL_SWITCH = path.join('kalshi-report', '.halt');

class RiskLimits {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxContractsPerOrder] - Contracts in a single order
   * @param {number} [options.maxNotionalPerMarketCents] - Per-market exposure cap
   * @param {number} [options.maxTotalOpenNotionalCents] - Total exposure cap
   * @param {number} [options.minEdgeCents] - Smallest edge worth trading
   * @param {number} [options.dailyLossCapCents] - Realized loss that halts trading
   * @param {string} [options.killSwitchPath] - Halt file path
   * @param {Object} [options.fsImpl] - fs implementation; injectable for tests
   */
  constructor(options = {}) {
    this.maxContractsPerOrder =
      options.maxContractsPerOrder ??
      parseInt(process.env.KALSHI_MAX_CONTRACTS_PER_ORDER || '50', 10);

    this.maxNotionalPerMarketCents =
      options.maxNotionalPerMarketCents ??
      parseInt(process.env.KALSHI_MAX_MARKET_NOTIONAL || '5000', 10);

    this.maxTotalOpenNotionalCents =
      options.maxTotalOpenNotionalCents ??
      parseInt(process.env.KALSHI_MAX_TOTAL_NOTIONAL || '25000', 10);

    this.minEdgeCents =
      options.minEdgeCents ?? parseFloat(process.env.KALSHI_MIN_EDGE_CENTS || '4');

    this.dailyLossCapCents =
      options.dailyLossCapCents ??
      parseInt(process.env.KALSHI_DAILY_LOSS_CAP_CENTS || '5000', 10);

    this.killSwitchPath =
      options.killSwitchPath || process.env.KALSHI_KILL_SWITCH_PATH || DEFAULT_KILL_SWITCH;

    this.fsImpl = options.fsImpl || fs;
  }

  /**
   * Whether the kill-switch file is present
   * @returns {boolean} True when trading is manually halted
   */
  isHalted() {
    try {
      return this.fsImpl.existsSync(this.killSwitchPath);
    } catch {
      // If the halt state cannot be determined, treat it as halted. Failing
      // closed is the only safe direction for a switch whose whole job is to
      // stop trading.
      return true;
    }
  }

  /**
   * Run-level gates, evaluated once before any order is considered
   * @param {Object} [state]
   * @param {number} [state.realizedPnlTodayCents] - Today's realized P&L, negative for a loss
   * @param {number} [state.balanceCents] - Available balance
   * @returns {Object} { allowed, violations[] }
   */
  preflight(state = {}) {
    const violations = [];

    if (this.isHalted()) {
      violations.push(`Kill switch present at ${this.killSwitchPath}; trading halted`);
    }

    const pnl = state.realizedPnlTodayCents;
    if (Number.isFinite(pnl) && pnl <= -this.dailyLossCapCents) {
      violations.push(
        `Daily loss ${formatCents(-pnl)} has reached the cap of ${formatCents(this.dailyLossCapCents)}`
      );
    }

    const balance = state.balanceCents;
    if (Number.isFinite(balance) && balance <= 0) {
      violations.push('Account balance is zero or negative');
    }

    return { allowed: violations.length === 0, violations };
  }

  /**
   * Per-order gates
   * @param {Object} order - { ticker, count, priceCents, edgeCents }
   * @param {Object} [portfolio]
   * @param {number} [portfolio.openNotionalCents] - Current total open exposure
   * @param {Map|Object} [portfolio.exposureByTicker] - Existing per-ticker exposure in cents
   * @param {number} [portfolio.balanceCents] - Available balance
   * @returns {Object} { allowed, violations[] }
   */
  check(order, portfolio = {}) {
    const violations = [];

    if (!Number.isFinite(order.count) || order.count <= 0) {
      violations.push(`Order count must be a positive integer, got ${order.count}`);
      return { allowed: false, violations };
    }

    if (!Number.isFinite(order.priceCents) || order.priceCents < 1 || order.priceCents > 99) {
      violations.push(`Order price must be between 1 and 99 cents, got ${order.priceCents}`);
      return { allowed: false, violations };
    }

    if (order.count > this.maxContractsPerOrder) {
      violations.push(
        `Order size ${order.count} exceeds the per-order maximum of ${this.maxContractsPerOrder}`
      );
    }

    if (Number.isFinite(order.edgeCents) && Math.abs(order.edgeCents) < this.minEdgeCents) {
      violations.push(
        `Edge ${order.edgeCents.toFixed(2)}c is below the ${this.minEdgeCents}c minimum`
      );
    }

    // Maximum loss on a long binary contract is the full premium paid, so the
    // notional cost IS the risk. No further haircut is needed.
    const orderNotional = order.count * order.priceCents;
    const existing = readExposure(portfolio.exposureByTicker, order.ticker);

    if (existing + orderNotional > this.maxNotionalPerMarketCents) {
      violations.push(
        `Market exposure would reach ${formatCents(existing + orderNotional)}, ` +
          `over the ${formatCents(this.maxNotionalPerMarketCents)} per-market cap`
      );
    }

    const openNotional = Number.isFinite(portfolio.openNotionalCents)
      ? portfolio.openNotionalCents
      : 0;

    if (openNotional + orderNotional > this.maxTotalOpenNotionalCents) {
      violations.push(
        `Total exposure would reach ${formatCents(openNotional + orderNotional)}, ` +
          `over the ${formatCents(this.maxTotalOpenNotionalCents)} cap`
      );
    }

    if (Number.isFinite(portfolio.balanceCents) && orderNotional > portfolio.balanceCents) {
      violations.push(
        `Order costs ${formatCents(orderNotional)} but only ` +
          `${formatCents(portfolio.balanceCents)} is available`
      );
    }

    return { allowed: violations.length === 0, violations };
  }

  /**
   * Summarize the active limits, for reports and startup logging
   * @returns {Object} Limit values
   */
  describe() {
    return {
      maxContractsPerOrder: this.maxContractsPerOrder,
      maxNotionalPerMarketCents: this.maxNotionalPerMarketCents,
      maxTotalOpenNotionalCents: this.maxTotalOpenNotionalCents,
      minEdgeCents: this.minEdgeCents,
      dailyLossCapCents: this.dailyLossCapCents,
      killSwitchPath: this.killSwitchPath
    };
  }
}

/**
 * Read a ticker's existing exposure from a Map or plain object
 * @param {Map|Object} exposure - Exposure keyed by ticker
 * @param {string} ticker - Market ticker
 * @returns {number} Exposure in cents, 0 when unknown
 */
function readExposure(exposure, ticker) {
  if (!exposure) {
    return 0;
  }

  const value = exposure instanceof Map ? exposure.get(ticker) : exposure[ticker];
  return Number.isFinite(value) ? value : 0;
}

/**
 * Render cents as dollars for human-readable messages
 * @param {number} cents - Amount in cents
 * @returns {string} Formatted dollars
 */
function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

module.exports = { RiskLimits, formatCents, readExposure, DEFAULT_KILL_SWITCH };
