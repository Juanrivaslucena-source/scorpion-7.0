#!/usr/bin/env node
/**
 * Demo Script - Run the demo site and audit it
 * 
 * This script:
 * 1. Starts the demo site server
 * 2. Runs the design audit against it
 * 3. Shows the results
 * 
 * Usage:
 *   node demo.js
 */

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const fs = require('node:fs');

async function main() {
  const demoDir = path.join(__dirname, 'demo-site');
  const serverPath = path.join(demoDir, 'server.js');
  
  console.log('='.repeat(60));
  console.log('Scorpion 7.0 - Demo Site Audit');
  console.log('='.repeat(60));
  
  // Start the demo server
  console.log('\n[1/4] Starting demo site server...');
  const server = spawn('node', [serverPath], {
    cwd: demoDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  // Wait for server to start
  await once(server.stdout, 'data');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('✅ Demo site running at http://localhost:3000');
  
  try {
    // Run the audit
    console.log('\n[2/4] Running design audit...');
    console.log('   Auditing: http://localhost:3000');
    console.log('   Routes: /, /about, /contact');
    console.log('   Viewports: desktop (1440x900), mobile (390x844)');
    
    const audit = spawn('npm', ['run', 'design:audit:skip-browser'], {
      cwd: __dirname,
      stdio: 'inherit',
      env: {
        ...process.env,
        DESIGN_AUDIT_BASE_URL: 'http://localhost:3000',
        DESIGN_AUDIT_ROUTES: '/,/about,/contact',
        DESIGN_AUDIT_SKIP_BROWSER: 'true'
      }
    });
    
    await once(audit, 'close');
    
    // Check the results
    console.log('\n[3/4] Checking audit results...');
    const reportDir = path.join(__dirname, 'design-report');
    const fixmePath = path.join(reportDir, 'FIXME.md');
    
    if (fs.existsSync(fixmePath)) {
      const fixmeContent = fs.readFileSync(fixmePath, 'utf8');
      const findingCount = fixmeContent.match(/Total Issues: (\d+)/);
      
      if (findingCount) {
        const count = findingCount[1];
        console.log(`   Found ${count} design issues`);
        
        if (count > 0) {
          console.log('\n   Issues found:');
          const lines = fixmeContent.split('\n');
          let inTasks = false;
          for (const line of lines) {
            if (line.includes('## Tasks for Claude Code')) {
              inTasks = true;
              continue;
            }
            if (inTasks && line.startsWith('##')) {
              break;
            }
            if (inTasks && line.startsWith('**')) {
              console.log(`   - ${line.replace(/\*\*/g, '')}`);
            }
          }
        }
      }
    }
    
    // Show the report
    console.log('\n[4/4] Audit complete!');
    console.log(`   Report: ${reportDir}`);
    console.log(`   FIXME.md: ${fixmePath}`);
    console.log('\n   To view the demo site: http://localhost:3000');
    console.log('   To see the report: cat design-report/FIXME.md');
    console.log('   To fix with Claude: npm run design:fix');
    
    console.log('\n' + '='.repeat(60));
    console.log('Demo running. Press Ctrl+C to stop the server.');
    console.log('='.repeat(60));
    
    // Keep running until user stops
    await new Promise(() => {});
    
  } catch (error) {
    console.error('Error:', error);
    server.kill();
    process.exit(1);
  } finally {
    // Cleanup on exit
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      server.kill();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('\nShutting down...');
      server.kill();
      process.exit(0);
    });
  }
}

main().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});
