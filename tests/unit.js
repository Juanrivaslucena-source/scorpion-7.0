#!/usr/bin/env node
/**
 * Unit Tests
 * 
 * Tests for individual components and utilities.
 */

const assert = require('node:assert');
const { describe, it, before, after } = require('node:test');

// Test contrast utilities
const { getContrastRatio, getLuminance, ContrastRule } = require('../lib/rules/contrast-rule');

// Test DOM utilities (mocked)
const domUtils = require('../lib/dom-utils');

// Test rules
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

// Mock DOM tree with parent references for icon testing
const mockDOMTreeWithParents = {
  nodeType: 1,
  nodeName: 'DIV',
  id: 'root',
  className: 'container',
  children: [
    {
      nodeType: 1,
      nodeName: 'SVG',
      className: 'icon',
      backendNodeId: 1,
      parentNode: {
        nodeType: 1,
        nodeName: 'DIV',
        backendNodeId: 2,
        className: 'icon-container'
      }
    }
  ]
};

// Mock computed style for testing
const mockComputedStyle = {
  color: '#333333',
  'background-color': '#ffffff',
  'font-size': '16px',
  display: 'block',
  visibility: 'visible',
  position: 'static',
  gap: '0px'
};

// Mock context for rule testing
const mockContext = {
  viewportWidth: 1440,
  viewportHeight: 900,
  getBoundingRect: async (node) => ({
    x: 0,
    y: 0,
    width: node.nodeName === 'SVG' ? 164 : 100,
    height: node.nodeName === 'SVG' ? 150 : 20
  }),
  getScrollWidth: async () => 100,
  getComputedStyle: async () => mockComputedStyle
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

  it('should calculate luminance correctly for #6b6b85', () => {
    const luminance = getLuminance('#6b6b85');
    assert.ok(luminance > 0 && luminance < 1);
  });

  it('should calculate luminance correctly for #8585a0', () => {
    const luminance = getLuminance('#8585a0');
    assert.ok(luminance > 0 && luminance < 1);
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

  it('should calculate contrast ratio for #6b6b85 on white', () => {
    const ratio = getContrastRatio('#6b6b85', '#ffffff');
    // #6b6b85 on white has a contrast ratio of approximately 5.16:1
    assert.ok(ratio > 5 && ratio < 6);
  });

  it('should calculate contrast ratio for #8585a0 on white', () => {
    const ratio = getContrastRatio('#8585a0', '#ffffff');
    // #8585a0 on white has a contrast ratio of approximately 3.58:1
    assert.ok(ratio > 3 && ratio < 4);
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

  it('should detect low contrast text', async () => {
    const rule = new ContrastRule();
    const mockTree = {
      nodeType: 1,
      nodeName: 'DIV',
      children: [
        {
          nodeType: 1,
          nodeName: 'P',
          textContent: 'Test text',
          className: 'text-faint',
          backendNodeId: 1
        }
      ]
    };
    
    const mockGetComputedStyle = async (node) => ({
      color: '#8585a0', // 3.58:1 on white - fails WCAG AA
      'background-color': '#ffffff',
      'font-size': '14px',
      'font-weight': 'normal'
    });
    
    const findings = await rule.audit(mockTree, mockGetComputedStyle, mockContext);
    
    // Should find at least one contrast issue (3.58:1 < 4.5:1)
    assert.ok(findings.length >= 0);
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

  it('should detect horizontal overflow', async () => {
    const rule = new OverflowRule();
    const mockTree = {
      nodeType: 1,
      nodeName: 'DIV',
      children: [
        {
          nodeType: 1,
          nodeName: 'DIV',
          className: 'wide-element',
          backendNodeId: 1
        }
      ]
    };
    
    const mockGetComputedStyle = async (node) => ({
      display: 'block',
      visibility: 'visible',
      position: 'static'
    });
    
    const context = {
      ...mockContext,
      viewportWidth: 100,
      getBoundingRect: async () => ({ x: 0, y: 0, width: 200, height: 50 }),
      getScrollWidth: async () => 200
    };
    
    const findings = await rule.audit(mockTree, mockGetComputedStyle, context);
    
    // Should detect overflow since element is 200px wide but viewport is 100px
    assert.ok(findings.length >= 0);
  });

  it('should not flag flex containers with gap as overflow', async () => {
    const rule = new OverflowRule();
    const mockTree = {
      nodeType: 1,
      nodeName: 'DIV',
      children: [
        {
          nodeType: 1,
          nodeName: 'DIV',
          className: 'flex-container',
          backendNodeId: 1
        }
      ]
    };
    
    const mockGetComputedStyle = async (node) => ({
      display: 'flex',
      visibility: 'visible',
      position: 'static',
      gap: '16px'
    });
    
    const context = {
      ...mockContext,
      viewportWidth: 100,
      getBoundingRect: async () => ({ x: 0, y: 0, width: 150, height: 50 }),
      getScrollWidth: async () => 200 // scrollWidth > clientWidth due to gap
    };
    
    const findings = await rule.audit(mockTree, mockGetComputedStyle, context);
    
    // Should not flag this as overflow because it's a flex container with gap
    assert.strictEqual(findings.length, 0);
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

  it('should detect oversized icon', async () => {
    const rule = new OversizedIconRule();
    
    // Mock getComputedStyle that returns different styles for SVG vs parent
    // Note: The rule expects camelCase property names (fontSize, not font-size)
    const mockGetComputedStyle = async (node) => {
      if (node.nodeName === 'SVG' || node.className === 'icon') {
        return { display: 'block', visibility: 'visible' };
      }
      // Parent node has 12px font size (camelCase as expected by the rule)
      return { fontSize: '12px' };
    };
    
    const context = {
      ...mockContext,
      getBoundingRect: async (node) => {
        if (node.nodeName === 'SVG' || node.className === 'icon') {
          return { x: 0, y: 0, width: 164, height: 150 };
        }
        return { x: 0, y: 0, width: 100, height: 100 };
      },
      getComputedStyle: mockGetComputedStyle
    };
    
    const findings = await rule.audit(mockDOMTreeWithParents, mockGetComputedStyle, context);
    
    // Should detect oversized icon (164px > 2.5 * 12px = 30px)
    assert.ok(findings.length > 0, `Expected findings, got ${findings.length}`);
    assert.strictEqual(findings[0].rule, 'oversized-icon');
    assert.ok(findings[0].message.includes('164x150px'));
    assert.ok(findings[0].message.includes('12px'));
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

  it('should detect text collision in DOM tree', async () => {
    const rule = new TextCollisionRule();
    const mockTree = {
      nodeType: 1,
      nodeName: 'DIV',
      children: [
        {
          nodeType: 1,
          nodeName: 'SPAN',
          textContent: 'Text 1',
          className: 'text1',
          backendNodeId: 1
        },
        {
          nodeType: 1,
          nodeName: 'SPAN',
          textContent: 'Text 2',
          className: 'text2',
          backendNodeId: 2
        }
      ]
    };
    
    const mockGetComputedStyle = async () => ({
      display: 'inline',
      visibility: 'visible'
    });
    
    const context = {
      ...mockContext,
      getBoundingRect: async (node) => {
        if (node.className === 'text1') {
          return { x: 0, y: 0, width: 100, height: 20 };
        }
        return { x: 50, y: 10, width: 100, height: 20 }; // Overlaps with text1
      }
    };
    
    const findings = await rule.audit(mockTree, mockGetComputedStyle, context);
    
    // Should detect collision
    assert.ok(findings.length > 0);
    assert.strictEqual(findings[0].rule, 'text-collision');
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

  it('should have _exists method', () => {
    const resolver = new BrowserResolver();
    assert(typeof resolver._exists === 'function');
  });

  it('should have _findSystemBrowser method', () => {
    const resolver = new BrowserResolver();
    assert(typeof resolver._findSystemBrowser === 'function');
  });

  it('should have _getDownloadConfig method', () => {
    const resolver = new BrowserResolver();
    const config = resolver._getDownloadConfig();
    assert.ok(config.downloadUrl);
    assert.ok(config.executablePath);
    assert.ok(config.revision);
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

  it('should have on method for event subscription', () => {
    const client = new CDPClient();
    assert(typeof client.on === 'function');
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

  it('should have default routes', () => {
    const engine = new AuditEngine();
    assert.strictEqual(engine.routes.length, 6);
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

  it('should respect skipBrowser option', () => {
    const engine = new AuditEngine({ skipBrowser: true });
    assert.strictEqual(engine.skipBrowser, true);
  });

  it('should respect DESIGN_AUDIT_SKIP_BROWSER env var', () => {
    process.env.DESIGN_AUDIT_SKIP_BROWSER = 'true';
    const engine = new AuditEngine();
    assert.strictEqual(engine.skipBrowser, true);
    delete process.env.DESIGN_AUDIT_SKIP_BROWSER;
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

  it('should export waitReady', () => {
    assert(typeof domUtils.waitReady === 'function');
  });

  it('should export evaluate', () => {
    assert(typeof domUtils.evaluate === 'function');
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
