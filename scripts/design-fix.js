#!/usr/bin/env node
/**
 * Design Fix Script
 * 
 * Runs the audit, hands FIXME.md to Claude Code, then re-audits to confirm.
 * 
 * Usage:
 *   npm run design:fix
 * 
 * Environment variables:
 *   CLAUDE_CLI_PATH - Path to claude CLI (default: 'claude')
 *   DESIGN_AUDIT_BASE_URL - Base URL for audit (default: 'http://localhost:3000')
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { AuditEngine } = require('../lib/audit-engine');

/**
 * Run a command and return output
 */
function runCommand(command, options = {}) {
  const { cwd = process.cwd(), stdio = 'inherit' } = options;
  
  try {
    const result = execSync(command, {
      cwd,
      stdio,
      encoding: 'utf8'
    });
    return { success: true, output: result };
  } catch (error) {
    return { 
      success: false, 
      output: error.stdout || '',
      error: error.stderr || error.message 
    };
  }
}

/**
 * Check if claude CLI is available
 */
function checkClaudeAvailable() {
  const claudePath = process.env.CLAUDE_CLI_PATH || 'claude';
  
  try {
    execSync(`${claudePath} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Main fix function
 */
async function main() {
  const startTime = Date.now();
  
  console.log('Starting design fix workflow...');
  console.log('='.repeat(50));

  const reportDir = path.join(process.cwd(), 'design-report');
  const fixmePath = path.join(reportDir, 'FIXME.md');

  // Step 1: Run initial audit
  console.log('\n[1/4] Running initial design audit...');
  
  const engine = new AuditEngine({
    reportDir,
    baseUrl: process.env.DESIGN_AUDIT_BASE_URL || 'http://localhost:3000',
    routes: process.env.DESIGN_AUDIT_ROUTES?.split(',') || [
      '/', '/about', '/contact', '/dashboard', '/settings', '/profile'
    ],
    viewports: [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 }
    ]
  });

  try {
    await engine.initialize();
    const initialResults = await engine.run();
    await engine.cleanup();

    const initialFindings = initialResults.totalFindings;
    
    if (initialFindings === 0) {
      console.log('✅ No design issues found. Nothing to fix.');
      process.exit(0);
    }

    console.log(`   Found ${initialFindings} issues. See ${fixmePath}`);

    // Step 2: Check if claude CLI is available
    console.log('\n[2/4] Checking Claude Code availability...');
    
    if (!checkClaudeAvailable()) {
      console.warn('   ⚠️  Claude CLI not found. Please install it from https://github.com/anthropics/claude-code');
      console.log(`   FIXME.md generated at: ${fixmePath}`);
      console.log('   Run: claude --prompt "Please fix the design issues in FIXME.md"');
      process.exit(1);
    }

    console.log('   ✅ Claude CLI is available');

    // Step 3: Hand off to Claude Code
    console.log('\n[3/4] Handing off to Claude Code...');
    
    const claudePath = process.env.CLAUDE_CLI_PATH || 'claude';
    const projectInstructions = path.join(process.cwd(), 'CLAUDE.md');
    
    // Build the prompt
    const prompt = [
      'You are a design engineer. Fix the design issues described in FIXME.md.',
      'Follow the project conventions in CLAUDE.md.',
      'Fix the UI, never weaken a rule to make a finding disappear.',
      'After fixing, verify by running: npm run design:audit'
    ].join(' ');

    // Run claude with the FIXME.md
    const claudeArgs = [
      '--prompt', prompt,
      '--file', fixmePath
    ];

    // If CLAUDE.md exists, include it
    if (fs.existsSync(projectInstructions)) {
      claudeArgs.push('--file', projectInstructions);
    }

    console.log(`   Running: ${claudePath} ${claudeArgs.join(' ')}`);
    
    const result = runCommand(`${claudePath} ${claudeArgs.join(' ')}`, {
      stdio: 'inherit'
    });

    if (!result.success) {
      console.error('   ❌ Claude Code failed:', result.error);
      process.exit(1);
    }

    console.log('   ✅ Claude Code completed');

    // Step 4: Re-audit to confirm fixes
    console.log('\n[4/4] Running follow-up audit to verify fixes...');
    
    const followUpEngine = new AuditEngine({
      reportDir: path.join(process.cwd(), 'design-report-followup'),
      baseUrl: process.env.DESIGN_AUDIT_BASE_URL || 'http://localhost:3000',
      routes: process.env.DESIGN_AUDIT_ROUTES?.split(',') || [
        '/', '/about', '/contact', '/dashboard', '/settings', '/profile'
      ],
      viewports: [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'mobile', width: 390, height: 844 }
      ]
    });

    await followUpEngine.initialize();
    const followUpResults = await followUpEngine.run();
    await followUpEngine.cleanup();

    const followUpFindings = followUpResults.totalFindings;
    const fixedCount = initialFindings - followUpFindings;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('='.repeat(50));
    console.log(`Fix workflow completed in ${elapsed}s`);
    console.log(`Initial findings: ${initialFindings}`);
    console.log(`After fix: ${followUpFindings}`);
    console.log(`Fixed: ${fixedCount}`);

    if (followUpFindings === 0) {
      console.log('\n✅ All design issues resolved!');
      process.exit(0);
    } else if (followUpFindings < initialFindings) {
      console.log(`\n⚠️  ${followUpFindings} issues remain. Please review.`);
      process.exit(1);
    } else {
      console.log('\n❌ No improvement detected. Please check the fixes.');
      process.exit(1);
    }

  } catch (error) {
    console.error('Fix workflow failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { main };
