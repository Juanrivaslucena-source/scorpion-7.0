#!/usr/bin/env node
/**
 * Unit Tests
 * 
 * Tests for individual components and utilities.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');

// Test contrast utilities
const { getContrastRatio, getLuminance } = require('../lib/rules/contrast-rule');

// Test DOM utilities (mocked)
const domUtils = require('../lib/dom-utils');

// Test rules
const { ContrastRule } = require('../lib/rules/contrast-rule');
const { OverflowRule } = require('../lib/rules/overflow-rule');
const { OversizedIconRule } = require('../lib/rules/oversized-icon-rule');
const { TextCollisionRule } = require('../lib/rules/text-collision-rule');

// Test BrowserResolver
const { BrowserResolver } = require('../lib/browser-resolver');

// Test CDPClient
const { CDPClient } = require('../lib/cdp-client');

// Test AuditEngine
const { AuditEngine } = require('../lib/audit-engine');

// Mock DOM tree for testing
const mockDOMTree = {
  nodeType: 1,
  nodeName: 'DIV',
  id: 'root',
  className: 'container',
  children: [
    {
      nodeType: 1,
      nodeName: 'P',
      className: 'text',
      textContent: 'Hello World',
      children: []
    },
    {
      nodeType: 1,
      nodeName: 'SVG',
      className: 'icon',
      children: []
    }
  ]
};

describe('Contrast Utilities', () => {
  it('should calculate luminance correctly for white', () => {
    assert.strictEqual(getLuminance('#ffffff'), 1);
  });

  it('should calculate luminance correctly for black', () => {
    assert.strictEqual(getLuminance('#000000'), 0);
  });

  it('should calculate luminance correctly for gray', () => {
    const grayLuminance = getLuminance('#808080');
    assert.ok(grayLuminance > 0 && grayLuminance < 1);
  });

  it('should calculate contrast ratio for black on white', () => {
    const ratio = getContrastRatio('#000000', '#ffffff');
    assert.strictEqual(ratio, 21);
  });

  it('should calculate contrast ratio for white on black', () => {
    const ratio = getContrastRatio('#ffffff', '#000000');
    assert.strictEqual(ratio, 21);
  });

  it('should calculate contrast ratio for gray on white', () => {
    const ratio = getContrastRatio('#808080', '#ffffff');
    assert.ok(ratio > 1 && ratio < 21);
  });
});

describe('ContrastRule', () => {
  it('should be instantiable', () => {
    const rule = new ContrastRule();
    assert.strictEqual(rule.id, 'contrast');
    assert.strictEqual(rule.name, 'WCAG AA Contrast');
    assert.strictEqual(rule.severity, 'error');
  });

  it('should have audit method', () => {
    const rule = new ContrastRule();
    assert(typeof rule.audit === 'function');
  });

  it('should have groupFindings method', () => {
    const rule = new ContrastRule();
    assert(typeof rule.groupFindings === 'function');
  });
});

describe('OverflowRule', () => {
  it('should be instantiable', () => {
    const rule = new OverflowRule();
    assert.strictEqual(rule.id, 'horizontal-overflow');
    assert.strictEqual(rule.name, 'Horizontal Overflow');
    assert.strictEqual(rule.severity, 'error');
  });

  it('should have audit method', () => {
    const rule = new OverflowRule();
    assert(typeof rule.audit === 'function');
  });
});

describe('OversizedIconRule', () => {
  it('should be instantiable', () => {
    const rule = new OversizedIconRule();
    assert.strictEqual(rule.id, 'oversized-icon');
    assert.strictEqual(rule.name, 'Oversized Icon');
    assert.strictEqual(rule.severity, 'error');
  });

  it('should have MAX_ICON_RATIO constant', () => {
    const rule = new OversizedIconRule();
    assert.strictEqual(rule.MAX_ICON_RATIO, 2.5);
  });

  it('should have audit method', () => {
    const rule = new OversizedIconRule();
    assert(typeof rule.audit === 'function');
  });
});

describe('TextCollisionRule', () => {
  it('should be instantiable', () => {
    const rule = new TextCollisionRule();
    assert.strictEqual(rule.id, 'text-collision');
    assert.strictEqual(rule.name, 'Text Collision');
    assert.strictEqual(rule.severity, 'error');
  });

  it('should have COLLISION_THRESHOLD constant', () => {
    const rule = new TextCollisionRule();
    assert.strictEqual(rule.COLLISION_THRESHOLD, 0.1);
  });

  it('should have audit method', () => {
    const rule = new TextCollisionRule();
    assert(typeof rule.audit === 'function');
  });

  it('should detect rectangle collision', () => {
    const rule = new TextCollisionRule();
    const rectA = { x: 0, y: 0, width: 100, height: 100 };
    const rectB = { x: 50, y: 50, width: 100, height: 100 };
    
    assert(rule._checkCollision(rectA, rectB));
  });

  it('should not detect collision for non-overlapping rectangles', () => {
    const rule = new TextCollisionRule();
    const rectA = { x: 0, y: 0, width: 100, height: 100 };
    const rectB = { x: 200, y: 200, width: 100, height: 100 };
    
    assert(!rule._checkCollision(rectA, rectB));
  });

  it('should calculate overlap percentage', () => {
    const rule = new TextCollisionRule();
    const rectA = { x: 0, y: 0, width: 100, height: 100 };
    const rectB = { x: 50, y: 50, width: 100, height: 100 };
    
    const overlap = rule._calculateOverlap(rectA, rectB);
    assert.ok(overlap > 0 && overlap <= 100);
  });
});

describe('BrowserResolver', () => {
  it('should be instantiable', () => {
    const resolver = new BrowserResolver();
    assert.ok(resolver);
  });

  it('should have resolve method', () => {
    const resolver = new BrowserResolver();
    assert(typeof resolver.resolve === 'function');
  });

  it('should have createClient method', () => {
    const resolver = new BrowserResolver();
    assert(typeof resolver.createClient === 'function');
  });
});

describe('CDPClient', () => {
  it('should be instantiable', () => {
    const client = new CDPClient();
    assert.ok(client);
  });

  it('should have connect method', () => {
    const client = new CDPClient();
    assert(typeof client.connect === 'function');
  });

  it('should have send method', () => {
    const client = new CDPClient();
    assert(typeof client.send === 'function');
  });

  it('should have close method', () => {
    const client = new CDPClient();
    assert(typeof client.close === 'function');
  });

  it('should have isConnected getter', () => {
    const client = new CDPClient();
    assert(typeof client.isConnected === 'boolean' || typeof client.isConnected === 'function');
  });
});

describe('AuditEngine', () => {
  it('should be instantiable', () => {
    const engine = new AuditEngine();
    assert.ok(engine);
  });

  it('should have default viewports', () => {
    const engine = new AuditEngine();
    assert.strictEqual(engine.viewports.length, 2);
    assert.strictEqual(engine.viewports[0].name, 'desktop');
    assert.strictEqual(engine.viewports[1].name, 'mobile');
  });

  it('should have default rules', () => {
    const engine = new AuditEngine();
    assert.strictEqual(engine.rules.length, 4);
  });

  it('should allow adding custom rules', () => {
    const engine = new AuditEngine();
    const initialCount = engine.rules.length;
    
    engine.addRule({
      id: 'custom-rule',
      name: 'Custom Rule',
      audit: async () => []
    });
    
    assert.strictEqual(engine.rules.length, initialCount + 1);
  });

  it('should have initialize method', () => {
    const engine = new AuditEngine();
    assert(typeof engine.initialize === 'function');
  });

  it('should have run method', () => {
    const engine = new AuditEngine();
    assert(typeof engine.run === 'function');
  });

  it('should have cleanup method', () => {
    const engine = new AuditEngine();
    assert(typeof engine.cleanup === 'function');
  });
});

describe('DOM Utilities', () => {
  it('should export getComputedStyle', () => {
    assert(typeof domUtils.getComputedStyle === 'function');
  });

  it('should export getBoundingRect', () => {
    assert(typeof domUtils.getBoundingRect === 'function');
  });

  it('should export getScrollWidth', () => {
    assert(typeof domUtils.getScrollWidth === 'function');
  });

  it('should export navigate', () => {
    assert(typeof domUtils.navigate === 'function');
  });

  it('should export setViewport', () => {
    assert(typeof domUtils.setViewport === 'function');
  });

  it('should export getDOMTree', () => {
    assert(typeof domUtils.getDOMTree === 'function');
  });

  it('should export captureScreenshot', () => {
    assert(typeof domUtils.captureScreenshot === 'function');
  });
});

describe('Mock DOM Tree', () => {
  it('should have correct structure', () => {
    assert.strictEqual(mockDOMTree.nodeType, 1);
    assert.strictEqual(mockDOMTree.nodeName, 'DIV');
    assert.strictEqual(mockDOMTree.children.length, 2);
  });

  it('should have text element', () => {
    const textElement = mockDOMTree.children[0];
    assert.strictEqual(textElement.nodeName, 'P');
    assert.strictEqual(textElement.textContent, 'Hello World');
  });

  it('should have SVG element', () => {
    const svgElement = mockDOMTree.children[1];
    assert.strictEqual(svgElement.nodeName, 'SVG');
    assert.strictEqual(svgElement.className, 'icon');
  });
});

// Run tests
console.log('Running unit tests...');
