#!/usr/bin/env node
/**
 * CDP Shape Tests
 *
 * The other test suites feed the rules browser-shaped nodes (textContent,
 * className, id) and object-shaped computed styles. Chromium's DevTools
 * Protocol produces neither, so those suites can pass while the audit finds
 * nothing on a real page. These tests exercise the adapters against the shapes
 * CDP actually returns.
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');

const { normalizeDOMTree } = require('../lib/dom-utils');
const { OversizedIconRule } = require('../lib/rules/oversized-icon-rule');
const { OverflowRule } = require('../lib/rules/overflow-rule');
const { ContrastRule } = require('../lib/rules/contrast-rule');

/**
 * A DOM.getDocument response shaped the way CDP returns it: a #document root,
 * flat attribute arrays, and text carried on child nodes.
 */
function cdpDocument() {
  return {
    nodeId: 1,
    backendNodeId: 1,
    nodeType: 9,
    nodeName: '#document',
    children: [
      { nodeId: 2, backendNodeId: 2, nodeType: 10, nodeName: 'html' },
      {
        nodeId: 3,
        backendNodeId: 3,
        nodeType: 1,
        nodeName: 'HTML',
        children: [
          {
            nodeId: 4,
            backendNodeId: 4,
            nodeType: 1,
            nodeName: 'BODY',
            children: [
              {
                nodeId: 5,
                backendNodeId: 5,
                nodeType: 1,
                nodeName: 'H1',
                attributes: ['class', 'logo'],
                children: [
                  { nodeId: 6, backendNodeId: 6, nodeType: 3, nodeName: '#text', nodeValue: 'Scorpion 7.0' }
                ]
              },
              {
                nodeId: 7,
                backendNodeId: 7,
                nodeType: 1,
                nodeName: 'svg',
                attributes: ['class', 'huge-icon', 'aria-hidden', 'true'],
                children: []
              },
              {
                nodeId: 8,
                backendNodeId: 8,
                nodeType: 1,
                nodeName: 'DIV',
                attributes: ['id', 'wide', 'class', 'overflow-box'],
                children: [
                  { nodeId: 9, backendNodeId: 9, nodeType: 3, nodeName: '#text', nodeValue: 'too wide' }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

/** Mirror of what getDOMTree hands the rules: normalized, rooted at <html>. */
function auditTree() {
  const root = normalizeDOMTree(cdpDocument());
  return root.children.find(child => child.nodeType === 1);
}

const byId = (root, backendNodeId) => {
  let found = null;
  (function walk(node) {
    if (!node) return;
    if (node.backendNodeId === backendNodeId) found = node;
    for (const child of node.children || []) walk(child);
  })(root);
  return found;
};

describe('normalizeDOMTree', () => {
  it('derives id and className from CDP flat attribute arrays', () => {
    const tree = auditTree();
    const box = byId(tree, 8);

    assert.strictEqual(box.id, 'wide');
    assert.strictEqual(box.className, 'overflow-box');
    assert.strictEqual(box.attrs['aria-hidden'], undefined);
  });

  it('derives textContent from descendant text nodes', () => {
    const tree = auditTree();

    assert.strictEqual(byId(tree, 5).textContent, 'Scorpion 7.0');
    assert.strictEqual(byId(tree, 7).textContent, '');
    // Ancestors accumulate their descendants' text, as in the real DOM.
    assert.match(byId(tree, 4).textContent, /Scorpion 7\.0/);
  });

  it('links parents without making the tree cyclic when serialized', () => {
    const tree = auditTree();

    assert.strictEqual(byId(tree, 5).parentNode.nodeName, 'BODY');
    assert.strictEqual(tree.parentNode.nodeName, '#document');
    assert.doesNotThrow(() => JSON.stringify(tree));
  });
});

describe('rules against CDP-shaped trees', () => {
  const styleFor = (node) => {
    if (node.backendNodeId === 7) {
      return { display: 'inline', visibility: 'visible', 'font-size': '16px', fontSize: '16px' };
    }
    return {
      display: 'block',
      visibility: 'visible',
      position: 'static',
      color: 'rgb(0, 0, 0)',
      'background-color': 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(255, 255, 255)',
      'font-size': '16px',
      fontSize: '16px',
      'font-weight': '400',
      fontWeight: '400'
    };
  };

  const context = (tree) => ({
    viewportWidth: 1440,
    viewportHeight: 900,
    getComputedStyle: async (node) => styleFor(node),
    getBoundingRect: async (node) => (
      node.backendNodeId === 7
        ? { x: 0, y: 0, width: 200, height: 200 }
        : { x: 0, y: 0, width: node.backendNodeId === 8 ? 2300 : 100, height: 24 }
    ),
    getScrollWidth: async () => 2300,
    getClientWidth: async () => 2300,
    tree
  });

  it('finds overflow starting from a document-rooted tree', async () => {
    const tree = auditTree();
    const ctx = context(tree);
    const findings = await new OverflowRule().audit(tree, ctx.getComputedStyle, ctx);

    assert.ok(findings.length > 0, 'expected the 2300px-wide element to be reported');
    assert.ok(findings.some(f => f.element === '#wide'));
  });

  it('reports an oversized svg exactly once', async () => {
    const tree = auditTree();
    const ctx = context(tree);
    const findings = await new OversizedIconRule().audit(tree, ctx.getComputedStyle, ctx);

    const icons = findings.filter(f => f.element === '.huge-icon');
    assert.strictEqual(icons.length, 1, 'svg matched by tag, class and aria-hidden must not be reported three times');
  });

  it('does not treat a text heading as an icon', async () => {
    const tree = auditTree();
    const ctx = context(tree);
    const findings = await new OversizedIconRule().audit(tree, ctx.getComputedStyle, ctx);

    assert.ok(
      !findings.some(f => f.element === '.logo'),
      '<h1 class="logo">Scorpion 7.0</h1> renders text and is not an icon'
    );
  });

  it('collects text elements from a CDP tree', async () => {
    const tree = auditTree();
    const ctx = context(tree);
    const rule = new ContrastRule();
    const nodes = rule._getTextNodes(tree);

    assert.ok(nodes.length > 0, 'CDP nodes carry no textContent of their own; normalization must supply it');
    assert.ok(nodes.some(n => n.className === 'logo'));
  });
});
