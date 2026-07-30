#!/usr/bin/env node
/**
 * Design Audit Script
 * 
 * Main entry point for running design audits.
 * Renders every view at multiple viewports and inspects the live DOM.
 */

const { AuditEngine } = require('../lib/audit-engine');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Exit codes. "Did not run" is deliberately distinct from "ran and found
 * nothing", because conflating them is what allowed a no-op audit to act as a
 * passing pre-commit gate.
 */
const EXIT_CLEAN = 0;          // audit ran, no findings
const EXIT_FINDINGS = 1;       // audit ran, findings present
const EXIT_SKIPPED = 2;        // skipped by request — not a pass
const EXIT_INFRASTRUCTURE = 3; // could not run, or inspected nothing

/**
 * Main audit function
 */
async function main() {
  const startTime = Date.now();
  
  console.log('Starting design audit...');
  console.log('='.repeat(50));

  try {
    // Create audit engine
    const engine = new AuditEngine({
      reportDir: path.join(process.cwd(), 'design-report'),
      baseUrl: process.env.DESIGN_AUDIT_BASE_URL || 'http://localhost:3000',
      // These must exist on the target. The list previously included
      // /dashboard, /settings and /profile, which demo-site does not serve, so
      // half of every audit ran against 404 pages and reported them as clean.
      routes: process.env.DESIGN_AUDIT_ROUTES?.split(',') || [
        '/',
        '/about',
        '/contact'
      ],
      viewports: [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'mobile', width: 390, height: 844 }
      ],
      timeout: parseInt(process.env.DESIGN_AUDIT_TIMEOUT || '30000')
    });

    // Initialize
    await engine.initialize();

    // Run audit
    const results = await engine.run();

    // Cleanup
    await engine.cleanup();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('='.repeat(50));

    // A skipped audit inspected nothing. It is not a pass, and must never read
    // like one — this script was previously wired into `npm run verify` and
    // printed "✅ passed with no findings" in 0.01s without opening a browser.
    if (results.skipped) {
      console.error('DESIGN AUDIT SKIPPED (DESIGN_AUDIT_SKIP_BROWSER=true)');
      console.error('0 pages audited, 0 rules evaluated. This is NOT a pass.');
      process.exit(EXIT_SKIPPED);
    }

    // "0 findings" is only meaningful alongside its denominator.
    console.log(`Pages audited: ${results.pagesAudited}`);
    console.log(`Pages failed:  ${results.pagesFailed}`);
    console.log(`Total findings: ${results.totalFindings}`);
    console.log(`Completed in ${elapsed}s`);
    console.log(`Report: ${path.join(process.cwd(), 'design-report')}`);

    if (results.pagesAudited === 0) {
      console.error('\n✗ Audit ran but inspected zero pages. Reporting infrastructure failure');
      console.error('  rather than success — a clean result requires having looked at something.');
      process.exit(EXIT_INFRASTRUCTURE);
    }

    if (results.pagesFailed > 0) {
      console.error(`\n✗ ${results.pagesFailed} page(s) could not be loaded or returned non-2xx.`);
      console.error('  Findings from this run are incomplete.');
      process.exit(EXIT_INFRASTRUCTURE);
    }

    if (results.totalFindings > 0) {
      console.log('\n❌ Design audit found issues. Please review FIXME.md');
      process.exit(EXIT_FINDINGS);
    }

    console.log('\n✅ Design audit passed with no findings');
    process.exit(EXIT_CLEAN);

  } catch (error) {
    console.error('\n✗ Design audit could not run:', error.message);
    console.error('  0 findings is NOT a pass when the audit failed to execute.');
    process.exit(EXIT_INFRASTRUCTURE);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
