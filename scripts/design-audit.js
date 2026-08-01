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
      routes: process.env.DESIGN_AUDIT_ROUTES?.split(',') || [
        '/',
        '/about',
        '/contact',
        '/dashboard',
        '/settings',
        '/profile'
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
    console.log(`Audit completed in ${elapsed}s`);
    console.log(`Total findings: ${results.totalFindings}`);
    console.log(`Report: ${path.join(process.cwd(), 'design-report')}`);

    // Exit with error code if findings exist
    if (results.totalFindings > 0) {
      console.log('\n❌ Design audit found issues. Please review FIXME.md');
      process.exit(1);
    } else if (results.skipped) {
      // Not a pass: no browser was launched, so no page was inspected.
      console.log('\n⏭️  Design audit skipped — no pages were inspected, nothing was verified.');
      process.exit(0);
    } else {
      console.log('\n✅ Design audit passed with no findings');
      process.exit(0);
    }

  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
