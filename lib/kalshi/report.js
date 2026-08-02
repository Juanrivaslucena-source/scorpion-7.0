/**
 * Kalshi Run Report
 *
 * Writes the artifacts of a scan to kalshi-report/, mirroring how the design
 * audit writes to design-report/:
 *
 *   scan-results.json  Full machine-readable output, including skipped markets
 *   scan-report.md     Human-readable summary
 *   orders.json        Exactly what was (or would have been) sent
 *
 * Everything is written even on a dry run, so a run can be reviewed before the
 * same inputs are replayed with --place.
 */

const fs = require('node:fs');
const path = require('node:path');
const { formatCents } = require('./risk');

const DEFAULT_REPORT_DIR = 'kalshi-report';

/**
 * Pluralize a count and its noun
 * @param {number} count - How many
 * @param {string} noun - Singular noun
 * @returns {string} e.g. "1 market" or "3 markets"
 */
function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * Format a probability as a percentage
 * @param {number|null} probability - Probability in [0, 1]
 * @returns {string} Formatted percentage
 */
function formatProbability(probability) {
  return probability === null || probability === undefined
    ? 'n/a'
    : `${(probability * 100).toFixed(1)}%`;
}

/**
 * Build the markdown report body
 * @param {Object} results - Run results
 * @returns {string} Markdown
 */
function buildMarkdown(results) {
  const {
    generatedAt,
    env,
    mode,
    candidates,
    skipped,
    arbitrage,
    orders,
    rejected,
    execution,
    llm,
    limits
  } = results;

  const arbitrageOpportunities = arbitrage || [];

  const lines = [];

  lines.push('# Kalshi Scan Report');
  lines.push('');
  lines.push(`**Generated:** ${generatedAt}`);
  lines.push(`**Environment:** ${env}`);
  lines.push(`**Mode:** ${mode}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Candidates with an edge: **${candidates.length}**`);
  lines.push(`- Arbitrage opportunities detected: **${arbitrageOpportunities.length}**`);
  lines.push(`- Markets skipped by liquidity gates: **${skipped.length}**`);
  lines.push(`- Orders sized: **${orders.length}**`);
  lines.push(`- Orders rejected by risk limits: **${rejected.length}**`);

  if (execution) {
    lines.push(`- Orders placed: **${execution.placed.length}**`);
    if (execution.failed.length > 0) {
      lines.push(`- Orders failed: **${execution.failed.length}**`);
    }
  }

  lines.push('');
  lines.push(`**Probability overlay:** ${llm.applied ? 'applied' : 'not applied'} — ${llm.reason}`);
  lines.push('');

  lines.push('## Risk Limits');
  lines.push('');
  lines.push(`- Max contracts per order: ${limits.maxContractsPerOrder}`);
  lines.push(`- Max per-market exposure: ${formatCents(limits.maxNotionalPerMarketCents)}`);
  lines.push(`- Max total exposure: ${formatCents(limits.maxTotalOpenNotionalCents)}`);
  lines.push(`- Minimum edge: ${limits.minEdgeCents}c`);
  lines.push(`- Daily loss cap: ${formatCents(limits.dailyLossCapCents)}`);
  lines.push('');

  if (arbitrageOpportunities.length > 0) {
    lines.push('## Arbitrage Opportunities');
    lines.push('');
    lines.push(
      'These are risk-free only if BOTH legs fill. This agent places single-leg ' +
        'orders, so it does not act on them — they are listed for manual or ' +
        'two-leg handling.'
    );
    lines.push('');
    lines.push('| Ticker | Edge | Detail |');
    lines.push('| --- | --- | --- |');

    for (const opportunity of arbitrageOpportunities.slice(0, 30)) {
      lines.push(
        `| \`${opportunity.ticker}\` | ${opportunity.edgeCents}c | ${opportunity.description} |`
      );
    }
    lines.push('');
  }

  if (candidates.length > 0) {
    lines.push('## Candidates');
    lines.push('');
    lines.push('| Ticker | Market | Fair | Edge | Side |');
    lines.push('| --- | --- | --- | --- | --- |');

    for (const candidate of candidates.slice(0, 50)) {
      lines.push(
        `| \`${candidate.ticker}\` | ${formatProbability(candidate.marketProbability)} | ` +
          `${formatProbability(candidate.fairProbability)} | ${candidate.edgeCents}c | ` +
          `${candidate.side.toUpperCase()} |`
      );
    }
    lines.push('');
  }

  if (orders.length > 0) {
    lines.push('## Orders');
    lines.push('');
    lines.push('| Ticker | Side | Count | Limit | Notional | Edge |');
    lines.push('| --- | --- | --- | --- | --- | --- |');

    for (const order of orders) {
      lines.push(
        `| \`${order.ticker}\` | ${order.side.toUpperCase()} | ${order.count} | ` +
          `${order.priceCents}c | ${formatCents(order.notionalCents)} | ${order.edgeCents}c |`
      );
    }
    lines.push('');
  }

  if (rejected.length > 0) {
    lines.push('## Rejected Orders');
    lines.push('');
    for (const entry of rejected.slice(0, 30)) {
      lines.push(`- \`${entry.ticker}\``);
      for (const reason of entry.reasons) {
        lines.push(`  - ${reason}`);
      }
    }
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push('## Skipped Markets');
    lines.push('');
    lines.push(`${pluralize(skipped.length, 'market')} did not pass the liquidity gates.`);
    lines.push('');

    // Group by reason rather than listing hundreds of individual markets.
    const byReason = new Map();
    for (const entry of skipped) {
      for (const reason of entry.reasons) {
        // Collapse every numeric run so "volume 412 below minimum 500" and
        // "volume 87 below minimum 500" land in the same bucket. Unit suffixes
        // mean word boundaries can't be used here ("10c" would not collapse),
        // so the gate messages avoid leading digits instead.
        const key = reason.replace(/\d+(?:\.\d+)?/g, 'N');
        byReason.set(key, (byReason.get(key) || 0) + 1);
      }
    }

    const sorted = [...byReason.entries()].sort((a, b) => b[1] - a[1]);
    for (const [reason, count] of sorted) {
      lines.push(`- ${reason} — ${pluralize(count, 'market')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Write the run artifacts to disk
 * @param {Object} results - Run results
 * @param {Object} [options]
 * @param {string} [options.reportDir] - Output directory
 * @returns {Object} Paths written
 */
function writeReport(results, { reportDir = DEFAULT_REPORT_DIR } = {}) {
  fs.mkdirSync(reportDir, { recursive: true });

  const resultsPath = path.join(reportDir, 'scan-results.json');
  const markdownPath = path.join(reportDir, 'scan-report.md');
  const ordersPath = path.join(reportDir, 'orders.json');

  // The candidates carry the full raw market payload, which makes the JSON
  // enormous and unreadable. Drop it; scan-report.md is the readable view and
  // the raw data is one API call away.
  const serializable = {
    ...results,
    candidates: results.candidates.map(({ market, ...rest }) => ({
      ...rest,
      market: market ? { ...market, raw: undefined } : null
    }))
  };

  fs.writeFileSync(resultsPath, JSON.stringify(serializable, null, 2));
  fs.writeFileSync(markdownPath, buildMarkdown(results));
  fs.writeFileSync(ordersPath, JSON.stringify(results.orders, null, 2));

  return { resultsPath, markdownPath, ordersPath };
}

module.exports = { writeReport, buildMarkdown, formatProbability, pluralize, DEFAULT_REPORT_DIR };
