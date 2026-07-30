/**
 * Oversized Icon Rule - Detects icons that are too large for their container
 * 
 * Checks for SVG or icon elements that exceed reasonable dimensions
 * relative to their parent's font size.
 */

/**
 * Oversized Icon audit rule
 */
class OversizedIconRule {
  constructor() {
    this.id = 'oversized-icon';
    this.name = 'Oversized Icon';
    this.description = 'Icons should not exceed reasonable dimensions relative to parent font size';
    this.severity = 'error';
    this.findings = [];
    this.MAX_ICON_RATIO = 2.5; // Icon should not be more than 2.5x parent font size
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
    
    // Find all icon/SVG elements
    const icons = this._findIcons(domTree);
    
    for (const icon of icons) {
      const iconStyle = await getComputedStyle(icon);
      
      if (!iconStyle) continue;
      
      // Skip hidden icons
      if (iconStyle.display === 'none' || iconStyle.visibility === 'hidden') {
        continue;
      }
      
      // Get icon dimensions
      const rect = await context.getBoundingRect?.(icon);
      
      if (!rect || rect.width === 0 || rect.height === 0) continue;
      
      // Get parent element and its font size
      const parent = this._getParent(icon, domTree);
      if (!parent) continue;
      
      const parentStyle = await getComputedStyle(parent);
      if (!parentStyle) continue;
      
      const parentFontSize = parseFloat(parentStyle.fontSize) || 16;
      
      // Check if icon is oversized
      const maxExpectedSize = parentFontSize * this.MAX_ICON_RATIO;
      
      if (rect.width > maxExpectedSize || rect.height > maxExpectedSize) {
        this.findings.push({
          rule: this.id,
          severity: this.severity,
          element: this._getElementSelector(icon, domTree),
          message: `${Math.round(rect.width)}x${Math.round(rect.height)}px rendered, parent font-size ${parentFontSize}px`,
          expected: `Max ${Math.round(maxExpectedSize)}px (${this.MAX_ICON_RATIO}x parent font size)`,
          actual: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
          parentFontSize,
          iconWidth: rect.width,
          iconHeight: rect.height
        });
      }
    }
    
    return this.findings;
  }

  /**
   * Find all icon/SVG elements in DOM tree
   * @param {Object} domTree - DOM tree
   * @returns {Array} Icon elements
   */
  _findIcons(domTree) {
    const icons = [];
    
    function walk(node) {
      if (!node || node.nodeType !== 1) return; // Only element nodes
      
      const nodeName = node.nodeName?.toLowerCase();
      
      // Match SVG elements
      if (nodeName === 'svg') {
        icons.push(node);
      }
      
      // Match common icon class names
      const className = node.className || '';
      const classList = className.toLowerCase().split(/\s+/);
      
      const iconKeywords = ['icon', 'svg', 'img', 'image', 'logo', 'emoji'];
      if (classList.some(c => iconKeywords.some(kw => c.includes(kw)))) {
        icons.push(node);
      }
      
      // Match elements with icon-like attributes
      if (node.attributes) {
        for (const attr of node.attributes) {
          if (attr.name === 'aria-hidden' && attr.value === 'true') {
            icons.push(node);
            break;
          }
        }
      }
      
      // Recurse into children
      if (node.children) {
        for (const child of node.children) {
          walk(child);
        }
      }
    }
    
    walk(domTree);
    return icons;
  }

  /**
   * Get parent element
   * @param {Object} element - DOM element
   * @param {Object} domTree - Full DOM tree
   * @returns {Object|null} Parent element
   */
  _getParent(element, domTree) {
    // This is a simplified approach
    // In a real implementation, we'd have parent references in the DOM tree
    return element.parentNode || null;
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

module.exports = { OversizedIconRule };
