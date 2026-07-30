#!/usr/bin/env node
/**
 * Test Runner
 * 
 * Runs all unit and integration tests.
 */

const { execSync } = require('node:child_process');
const path = require('node:path');

function runTests() {
  console.log('Running all tests...');
  console.log('='.repeat(50));

  let passed = 0;
  let failed = 0;

  // Run unit tests
  console.log('\n[Unit Tests]');
  try {
    execSync('node tests/unit.js', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    passed++;
  } catch {
    failed++;
  }

  // Run integration tests
  console.log('\n[Integration Tests]');
  try {
    execSync('node tests/integration.js', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    passed++;
  } catch {
    failed++;
  }

  // Run dependency check
  console.log('\n[Dependency Check]');
  try {
    execSync('node tests/dependency-check.js', {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    passed++;
  } catch {
    failed++;
  }

  console.log('='.repeat(50));
  console.log(`Tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
