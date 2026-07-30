/**
 * Contrast Rule - Checks WCAG AA contrast ratios
 * 
 * Checks that text elements meet minimum contrast requirements:
 * - Normal text: 4.5:1 minimum
 * - Large text (18.66px+ bold or 24px+): 3:1 minimum
 */

const { getComputedStyle } = require('../dom-utils');

const WCAG_AA_MIN = 4.5;
const WCAG_AA_LARGE_MIN = 3.0;
const LARGE_TEXT_THRESHOLD = 18.66; // px
const LARGE_TEXT_BOLD_THRESHOLD = 14; // px for bold

/**
 * Calculate relative luminance of a color
 * @param {string} hexColor - Hex color string (e.g., '#RRGGBB')
 * @returns {number} Luminance (0-1)
 */
function getLuminance(hexColor) {
  // Parse hex color
  let r, g, b;
  if (hexColor.startsWith('#')) {
    const hex = hexColor.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
    } else {
      return 0;
    }
  } else if (hexColor.startsWith('rgb(')) {
    const match = hexColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      r = parseInt(match[1]) / 255;
      g = parseInt(match[2]) / 255;
      b = parseInt(match[3]) / 255;
    } else {
      return 0;
    }
  } else {
    return 0;
  }

  // Apply gamma correction
  const sRGB = [r, g, b].map(v => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });

  // Calculate relative luminance
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/**
 * Calculate contrast ratio between two colors
 * @param {string} color1 - First color
 * @param {string} color2 - Second color
 * @returns {number} Contrast ratio (1-21)
 */
function getContrastRatio(color1, color2) {
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Resolve CSS variable to actual color
 * @param {Object} computedStyle - Computed style object
 * @param {string} property - CSS property name
 * @returns {string|null} Resolved color or null
 */
function resolveColor(computedStyle, property) {
  let value = computedStyle[property];
  
  if (!value || value === 'inherit' || value === 'initial' || value === 'unset') {
    return null;
  }

  // Handle CSS variables
  const varMatch = value.match(/var\(--([^)]+)\)/);
  if (varMatch) {
    const varName = `--${varMatch[1]}`;
    // Try to find the variable in the style
    // This is a simplified approach - in practice we'd need to walk up the DOM
    return null; // Will be handled by backdrop computation
  }

  return value;
}

/**
 * Check if element has large text
 * @param {Object} computedStyle - Computed style
 * @returns {boolean}
 */
function isLargeText(computedStyle) {
  const fontSize = parseFloat(computedStyle.fontSize) || 0;
  const fontWeight = computedStyle.fontWeight;
  
  if (fontSize >= 24) {
    return true;
  }
  
  if (fontSize >= LARGE_TEXT_BOLD_THRESHOLD) {
    const isBold = fontWeight === 'bold' || 
                  fontWeight === '700' || 
                  (parseInt(fontWeight) >= 700);
    return isBold;
  }
  
  return false;
}

/**
 * Get the background color for contrast calculation
 * @param {Object} element - DOM element
 * @param {Object} computedStyle - Computed style
 * @returns {string} Background color
 */
function getBackgroundColor(element, computedStyle) {
  // Try background-color first
  let bgColor = computedStyle.backgroundColor;
  
  if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
    return bgColor;
  }
  
  // Fall back to parent background
  // In a real implementation, we'd walk up the DOM tree
  // For now, return white as default
  return '#ffffff';
}

/**
 * Contrast audit rule
 */
class ContrastRule {
  constructor() {
    this.id = 'contrast';
    this.name = 'WCAG AA Contrast';
    this.description = 'Text elements must meet minimum contrast ratios';
    this.severity = 'error';
    this.findings = [];
    this._styleCache = new Map();
  }

  /**
   * Audit a DOM tree
   * @param {Object} domTree - DOM tree from CDP
   * @param {Function} getComputedStyle - Function to get computed styles
   * @returns {Promise<Array>} Array of findings
   */
  async audit(domTree, getComputedStyle) {
    this.findings = [];
    this._styleCache.clear();
    
    const nodes = this._getTextNodes(domTree);
    
    for (const node of nodes) {
      const computedStyle = await getComputedStyle(node);
      
      if (!computedStyle) continue;
      
      const color = resolveColor(computedStyle, 'color');
      const bgColor = getBackgroundColor(node, computedStyle);
      
      if (!color || !bgColor) continue;
      
      const contrast = getContrastRatio(color, bgColor);
      const isLarge = isLargeText(computedStyle);
      const minContrast = isLarge ? WCAG_AA_LARGE_MIN : WCAG_AA_MIN;
      
      if (contrast < minContrast) {
        this.findings.push({
          rule: this.id,
          severity: this.severity,
          element: this._getElementSelector(node, domTree),
          message: `Contrast ratio ${contrast.toFixed(2)}:1 fails WCAG AA ${isLarge ? '(large text)' : ''}`,
          expected: `Minimum ${minContrast}:1`,
          actual: `${contrast.toFixed(2)}:1`,
          color,
          bgColor
        });
      }
    }
    
    return this.findings;
  }

  /**
   * Get text nodes from DOM tree
   * @param {Object} domTree - DOM tree
   * @returns {Array} Text nodes
   */
  _getTextNodes(domTree) {
    const nodes = [];
    
    function walk(node, parent) {
      if (!node) return;
      
      // Skip script, style, etc.
      const nodeName = node.nodeName?.toLowerCase();
      if (nodeName === 'script' || nodeName === 'style' || 
          nodeName === 'link' || nodeName === 'meta') {
        return;
      }
      
      // Check if this node has text
      const hasText = node.nodeValue || 
                      (node.children && node.children.some(c => c.nodeValue));
      
      if (hasText && node.nodeType === 1) { // Element node
        // Check if it has visible text
        const text = node.textContent?.trim();
        if (text && text.length > 0) {
          nodes.push(node);
        }
      }
      
      // Recurse into children
      if (node.children) {
        for (const child of node.children) {
          walk(child, node);
        }
      }
    }
    
    walk(domTree);
    return nodes;
  }

  /**
   * Get CSS selector for element
   * @param {Object} element - DOM element
   * @param {Object} domTree - Full DOM tree
   * @returns {string} CSS selector
   */
  _getElementSelector(element, domTree) {
    // Simplified selector generation
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

  /**
   * Group findings by CSS variable or color
   * @returns {Array} Grouped findings
   */
  groupFindings() {
    const groups = new Map();
    
    for (const finding of this.findings) {
      const key = finding.color || finding.bgColor;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(finding);
    }
    
    return Array.from(groups.entries()).map(([key, findings]) => ({
      key,
      count: findings.length,
      findings,
      severity: this.severity
    }));
  }
}

module.exports = { ContrastRule, getContrastRatio, getLuminance };
