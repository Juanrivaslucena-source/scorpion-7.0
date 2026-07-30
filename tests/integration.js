#!/usr/bin/env node
/**
 * Integration Tests
 * 
 * Tests for the complete audit workflow.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');

// Test the audit engine components
const { AuditEngine } = require('../lib/audit-engine');

describe('AuditEngine Integration', () => {
  it('should be instantiable with default options', () => {
    const engine = new AuditEngine();
    assert.ok(engine);
    assert.strictEqual(engine.viewports.length, 2);
    assert.strictEqual(engine.rules.length, 4);
  });

  it('should allow custom configuration', () => {
    const engine = new AuditEngine({
      baseUrl: 'http://custom.local',
      routes: ['/', '/custom'],
      viewports: [
        { name: 'custom', width: 800, height: 600 }
      ]
    });
    
    assert.strictEqual(engine.baseUrl, 'http://custom.local');
    assert.strictEqual(engine.routes.length, 2);
    assert.strictEqual(engine.viewports.length, 1);
    assert.strictEqual(engine.viewports[0].name, 'custom');
  });

  it('should allow adding custom rules', () => {
    const engine = new AuditEngine();
    const initialCount = engine.rules.length;
    
    engine.addRule({
      id: 'custom-rule',
      name: 'Custom Rule',
      severity: 'warning',
      audit: async () => []
    });
    
    assert.strictEqual(engine.rules.length, initialCount + 1);
  });
});

describe('Rule Integration', () => {
  it('should instantiate all rules', () => {
    const { ContrastRule } = require('../lib/rules/contrast-rule');
    const { OverflowRule } = require('../lib/rules/overflow-rule');
    const { OversizedIconRule } = require('../lib/rules/oversized-icon-rule');
    const { TextCollisionRule } = require('../lib/rules/text-collision-rule');
    
    const contrastRule = new ContrastRule();
    const overflowRule = new OverflowRule();
    const iconRule = new OversizedIconRule();
    const collisionRule = new TextCollisionRule();
    
    assert.ok(contrastRule);
    assert.ok(overflowRule);
    assert.ok(iconRule);
    assert.ok(collisionRule);
  });

  it('should have consistent rule IDs', () => {
    const { ContrastRule } = require('../lib/rules/contrast-rule');
    const { OverflowRule } = require('../lib/rules/overflow-rule');
    const { OversizedIconRule } = require('../lib/rules/oversized-icon-rule');
    const { TextCollisionRule } = require('../lib/rules/text-collision-rule');
    
    assert.strictEqual(new ContrastRule().id, 'contrast');
    assert.strictEqual(new OverflowRule().id, 'horizontal-overflow');
    assert.strictEqual(new OversizedIconRule().id, 'oversized-icon');
    assert.strictEqual(new TextCollisionRule().id, 'text-collision');
  });

  it('should have consistent rule severities', () => {
    const { ContrastRule } = require('../lib/rules/contrast-rule');
    const { OverflowRule } = require('../lib/rules/overflow-rule');
    const { OversizedIconRule } = require('../lib/rules/oversized-icon-rule');
    const { TextCollisionRule } = require('../lib/rules/text-collision-rule');
    
    assert.strictEqual(new ContrastRule().severity, 'error');
    assert.strictEqual(new OverflowRule().severity, 'error');
    assert.strictEqual(new OversizedIconRule().severity, 'error');
    assert.strictEqual(new TextCollisionRule().severity, 'error');
  });
});

describe('Browser Resolver Integration', () => {
  it('should be instantiable', () => {
    const { BrowserResolver } = require('../lib/browser-resolver');
    const resolver = new BrowserResolver();
    assert.ok(resolver);
  });

  it('should have resolve method', () => {
    const { BrowserResolver } = require('../lib/browser-resolver');
    const resolver = new BrowserResolver();
    assert(typeof resolver.resolve === 'function');
  });

  it('should have createClient method', () => {
    const { BrowserResolver } = require('../lib/browser-resolver');
    const resolver = new BrowserResolver();
    assert(typeof resolver.createClient === 'function');
  });
});

describe('CDP Client Integration', () => {
  it('should be instantiable', () => {
    const { CDPClient } = require('../lib/cdp-client');
    const client = new CDPClient();
    assert.ok(client);
  });

  it('should have connect method', () => {
    const { CDPClient } = require('../lib/cdp-client');
    const client = new CDPClient();
    assert(typeof client.connect === 'function');
  });

  it('should have send method', () => {
    const { CDPClient } = require('../lib/cdp-client');
    const client = new CDPClient();
    assert(typeof client.send === 'function');
  });

  it('should have close method', () => {
    const { CDPClient } = require('../lib/cdp-client');
    const client = new CDPClient();
    assert(typeof client.close === 'function');
  });
});

// Run tests
console.log('Running integration tests...');
