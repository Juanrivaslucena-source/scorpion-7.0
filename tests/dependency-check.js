#!/usr/bin/env node
/**
 * Dependency Check
 * 
 * Verifies that the project has zero runtime dependencies.
 * This ensures the audit system can run without npm install.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function checkDependencies() {
  console.log('Checking runtime dependencies...');
  
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Check dependencies
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};
  
  const runtimeDeps = {
    ...dependencies
  };
  
  // These are allowed (built into Node 22 or our fallback)
  const allowedBuiltins = [
    'fs',
    'path',
    'os',
    'child_process',
    'events',
    'websocket',
    'test',
    'assert'
  ];
  
  // Check for disallowed dependencies
  const disallowed = [];
  
  for (const [dep, version] of Object.entries(runtimeDeps)) {
    // Skip if it's a Node.js built-in module
    if (allowedBuiltins.includes(dep) || allowedBuiltins.includes(`node:${dep}`)) {
      continue;
    }
    
    // Skip if it's a dev-only dependency
    if (devDependencies[dep]) {
      continue;
    }
    
    disallowed.push(dep);
  }
  
  if (disallowed.length > 0) {
    console.error('❌ Found disallowed runtime dependencies:');
    for (const dep of disallowed) {
      console.error(`  - ${dep}`);
    }
    console.error('\nThe audit system must have zero runtime dependencies.');
    console.error('Use Node 22 built-in modules only.');
    process.exit(1);
  }
  
  console.log('✅ Zero runtime dependencies confirmed');
  
  // Verify Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.split('.')[0].slice(1));
  
  if (majorVersion < 22) {
    console.error(`❌ Node.js version ${nodeVersion} is too old. Requires Node 22+ for built-in WebSocket.`);
    process.exit(1);
  }
  
  console.log(`✅ Node.js ${nodeVersion} meets minimum requirement (22+)`);
  
  // The audit depends on Node's built-in global WebSocket. There is no fallback:
  // the former mock transport silently disabled every audit while reporting success.
  if (typeof globalThis.WebSocket !== 'function') {
    console.error('❌ globalThis.WebSocket is missing — Node 22+ is required.');
    process.exit(1);
  }
  console.log('✅ Built-in global WebSocket is available');

  try {
    const { assertWebSocketAvailable } = require('../lib/cdp-socket');
    assertWebSocketAvailable();
    console.log('✅ CDP socket adapter loads and finds a usable WebSocket');
  } catch (error) {
    console.error('❌ CDP socket adapter failed:', error.message);
    process.exit(1);
  }
  
  // Verify all required modules can be loaded
  const requiredModules = [
    'fs',
    'path',
    'os',
    'child_process',
    'events'
  ];
  
  for (const module of requiredModules) {
    try {
      require(module);
      console.log(`✅ ${module} is available`);
    } catch (error) {
      console.error(`❌ ${module} is not available: ${error.message}`);
      process.exit(1);
    }
  }
  
  console.log('\n✅ All dependency checks passed');
}

checkDependencies();
