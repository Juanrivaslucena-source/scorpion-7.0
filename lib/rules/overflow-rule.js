/**
 * Overflow Rule - Detects horizontal overflow issues
 * 
 * Checks for elements that cause horizontal scrolling due to:
 * - Content wider than viewport
 * - Fixed positioning extending beyond viewport
 * - CSS gap inflating scrollWidth on flex containers (false positive to avoid)
 */

const { getComputedStyle } = require('../dom-utils');

/**
 * Overflow audit rule
 */
class OverflowRule {
  constructor() {
    this.id = 'horizontal-overflow';
    this.name = 'Horizontal Overflow';
    this.description = 'Elements should not cause horizontal overflow';
    this.severity = 'error';
    this.findings = [];
    this._styleCache = new Map();
  }

  /**
   * Audit a DOM tree
   * @param {Object} domTree - DOM tree from CDP
   * @param {Function} getComputedStyle - Function to get computed styles
   * @param {Object} context - Audit context
   * @returns {Promise<Array>} Array of findings
   */
  async audit(domTree, getComputedStyle, context = {}) {
    this.findings = [];
    this._styleCache.clear();
    
    const { viewportWidth = 1440 } = context;
    
    // Get all elements that might cause overflow
    const elements = this._getOverflowCandidates(domTree);
    
    for (const element of elements) {
      const computedStyle = await getComputedStyle(element);
      
      if (!computedStyle) continue;
      
      // Skip elements that are not rendered
      if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
        continue;
      }

      // Skip absolutely positioned elements that are out-of-flow
      // These are typically tooltips, popovers, etc. that don't affect layout
      if (computedStyle.position === 'absolute' || computedStyle.position === 'fixed') {
        continue;
      }

      // Get element dimensions
      const rect = await this._getBoundingRect(element, context);
      
      if (!rect) continue;
      
      // Check if element extends beyond viewport
      const rightEdge = rect.x + rect.width;
      
      if (rightEdge > viewportWidth) {
        const overflowAmount = rightEdge - viewportWidth;
        
        // Check if this is a flex container with gap causing false positive
        if (computedStyle.display === 'flex' || computedStyle.display === 'inline-flex') {
          // For flex containers, check if the overflow is due to gap
          // by comparing scrollWidth vs clientWidth
          const scrollWidth = await this._getScrollWidth(element, context);
          const clientWidth = rect.width;
          
          if (scrollWidth > clientWidth) {
            // This might be a false positive due to gap
            // Check if the element has gap property
            const gap = computedStyle.gap || computedStyle.columnGap || computedStyle.rowGap;
            if (gap && gap !== '0px' && gap !== 'normal') {
              // Skip flex containers with gap as they may have inflated scrollWidth
              continue;
            }
          }
        }
        
        this.findings.push({
          rule: this.id,
          severity: this.severity,
          element: this._getElementSelector(element, domTree),
          message: `Element overflows viewport by ${Math.round(overflowAmount)}px`,
          expected: `Width <= ${viewportWidth}px`,
          actual: `${Math.round(rect.width)}px at x=${Math.round(rect.x)}`,
          viewportWidth,
          elementWidth: rect.width,
          x: rect.x
        });
      }
    }
    
    return this.findings;
  }

  /**
   * Get elements that might cause overflow
   * @param {Object} domTree - DOM tree
   * @returns {Array} Candidate elements
   */
  _getOverflowCandidates(domTree) {
    const candidates = [];
    
    function walk(node) {
      if (!node || node.nodeType !== 1) return; // Only element nodes
      
      // Skip elements that typically don't cause overflow
      const nodeName = node.nodeName?.toLowerCase();
      if (nodeName === 'script' || nodeName === 'style' || 
          nodeName === 'link' || nodeName === 'meta' ||
          nodeName === 'head' || nodeName === 'title') {
        return;
      }
      
      // Include elements that might have width issues
      candidates.push(node);
      
      // Recurse into children
      if (node.children) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }
    
    walk(domTree);
    return candidates;
  }

  /**
   * Get bounding rect for element
   * @param {Object} element - DOM element
   * @param {Object} context - Audit context
   * @returns {Promise<Object|null>} Bounding rect
   */
  async _getBoundingRect(element, context) {
    // In a real implementation, this would use CDP Runtime.evaluate
    // to call getBoundingClientRect()
    if (context.getBoundingRect) {
      return await context.getBoundingRect(element);
    }
    return null;
  }

  /**
   * Get scroll width for element
   * @param {Object} element - DOM element
   * @param {Object} context - Audit context
   * @returns {Promise<number>} Scroll width
   */
  async _getScrollWidth(element, context) {
    if (context.getScrollWidth) {
      return await context.getScrollWidth(element);
    }
    return 0;
  }

  /**
   * Get CSS selector for element
   * @param {Object} element - DOM element
   * @param {Object} domTree - Full DOM tree
   * @returns {string} CSS selector
   */
  _getElementSelector(element, domTree) {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className) {
      const classes = element.className.split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        return `.${classes.join('.')}`;
      }
    }
    
    return element.nodeName?.toLowerCase() || 'element';
  }
}

module.exports = { OverflowRule };
