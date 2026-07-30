/**
 * Contrast Rule - Checks WCAG AA contrast ratios
 * 
 * Checks that text elements meet minimum contrast requirements:
 * - Normal text: 4.5:1 minimum
 * - Large text (18.66px+ bold or 24px+): 3:1 minimum
 */

const { getComputedStyle } = require('../dom-utils');
const {
  parseColor,
  compositeOver,
  relativeLuminance,
  contrastRatio,
} = require('../color');

const WCAG_AA_MIN = 4.5;
const WCAG_AA_LARGE_MIN = 3.0;
const LARGE_TEXT_THRESHOLD = 24; // px, any weight
// WCAG large text is 18.66px+ when bold. This was previously 14, which treated
// 14px bold as "large" and applied the lenient 3:1 threshold to it — another
// path that turned real failures into passes.
const LARGE_TEXT_BOLD_THRESHOLD = 18.66;

/**
 * Calculate relative luminance of a color
 * @param {string} hexColor - Hex color string (e.g., '#RRGGBB')
 * @returns {number} Luminance (0-1)
 */
function getLuminance(color) {
  const parsed = parseColor(color);
  if (!parsed) return null;
  return relativeLuminance(parsed);
}

/**
 * Calculate contrast ratio between two colors
 * @param {string} color1 - First color
 * @param {string} color2 - Second color
 * @returns {number} Contrast ratio (1-21)
 */
function getContrastRatio(color1, color2) {
  const a = parseColor(color1);
  const b = parseColor(color2);
  // Unparseable input yields null rather than a fabricated ratio. Returning a
  // number here is how the previous version reported 21:1 for colors it did not
  // understand, silently converting failures into passes.
  if (!a || !b) return null;
  // Composite any transparency against the other color so alpha is honoured
  // instead of discarded.
  const opaqueB = b.a >= 1 ? b : compositeOver(b, { r: 255, g: 255, b: 255, a: 1 });
  const opaqueA = a.a >= 1 ? a : compositeOver(a, opaqueB);
  return contrastRatio(opaqueA, opaqueB);
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
  
  if (fontSize >= LARGE_TEXT_THRESHOLD) {
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
 * Resolve the effective background behind an element by compositing its own
 * background over each ancestor's, down to the page canvas.
 *
 * The previous implementation returned '#ffffff' whenever the element's own
 * background was transparent, with a comment noting the ancestor walk was never
 * written. Since a transparent background is the default, almost every element
 * was measured against white regardless of what was actually behind it — dark
 * themes in particular were scored against the wrong backdrop entirely.
 *
 * @param {Object} element - node with an optional `ancestors` array, outermost last
 * @param {Object} computedStyle - the element's computed style
 * @param {Object} [canvas] - page canvas color, defaults to white
 * @returns {{r:number,g:number,b:number,a:number}} an opaque color
 */
function getBackgroundColor(element, computedStyle, canvas = { r: 255, g: 255, b: 255, a: 1 }) {
  // Innermost first: the element, then its ancestors outward.
  const chain = [computedStyle, ...(element?.ancestors ?? []).map((a) => a.computedStyle)];

  // Walk outward to find the first fully opaque layer; everything inside it
  // still has to be composited back over it in reverse order.
  const layers = [];
  for (const style of chain) {
    const parsed = parseColor(style?.backgroundColor);
    if (!parsed || parsed.a === 0) continue;
    layers.push(parsed);
    if (parsed.a >= 1) break;
  }

  let result = canvas;
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    result = compositeOver(layers[i], result);
  }
  return result;
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
    // Colors the parser could not understand. Surfaced rather than scored, so
    // parser gaps show up as gaps instead of masquerading as passes.
    this.unparseable = [];
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
    this.unparseable = [];
    this._styleCache.clear();

    const nodes = this._getTextNodes(domTree);
    
    for (const node of nodes) {
      const computedStyle = await getComputedStyle(node);
      
      if (!computedStyle) continue;
      
      const color = resolveColor(computedStyle, 'color');
      if (!color) continue;

      const fg = parseColor(color);
      // An unparseable foreground is unknown, not black. Skip it and record it
      // separately rather than scoring it — scoring guesses is what made this
      // rule silently report passes.
      if (!fg) {
        this.unparseable.push({ selector: this._getElementSelector(node, domTree), color });
        continue;
      }

      // Resolve ancestor backgrounds so a transparent element is measured
      // against what is actually behind it rather than an assumed white page.
      await this._resolveAncestorStyles(node, getComputedStyle);
      const bg = getBackgroundColor(node, computedStyle);
      const contrast = contrastRatio(compositeOver(fg, bg), bg);
      const isLarge = isLargeText(computedStyle);
      const minContrast = isLarge ? WCAG_AA_LARGE_MIN : WCAG_AA_MIN;

      if (contrast < minContrast) {
        const bgCss = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
        this.findings.push({
          rule: this.id,
          severity: this.severity,
          element: this._getElementSelector(node, domTree),
          message: `Contrast ratio ${contrast.toFixed(2)}:1 fails WCAG AA ${isLarge ? '(large text)' : ''}`,
          expected: `Minimum ${minContrast}:1`,
          actual: `${contrast.toFixed(2)}:1`,
          color,
          bgColor: bgCss
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
  /**
   * Populate `computedStyle` on an element's ancestors, stopping early once an
   * opaque background is found — there is no need to style the whole chain.
   * Results are cached per nodeId, since siblings share ancestors.
   *
   * @param {Object} node
   * @param {Function} getComputedStyle
   */
  async _resolveAncestorStyles(node, getComputedStyle) {
    for (const ancestor of node.ancestors ?? []) {
      if (!ancestor.computedStyle) {
        const cacheKey = ancestor.nodeId;
        if (cacheKey !== undefined && this._styleCache.has(cacheKey)) {
          ancestor.computedStyle = this._styleCache.get(cacheKey);
        } else {
          ancestor.computedStyle = await getComputedStyle(ancestor);
          if (cacheKey !== undefined) {
            this._styleCache.set(cacheKey, ancestor.computedStyle);
          }
        }
      }
      const parsed = parseColor(ancestor.computedStyle?.backgroundColor);
      if (parsed && parsed.a >= 1) break;
    }
  }

  _getTextNodes(domTree) {
    const nodes = [];
    const SKIP = new Set(['script', 'style', 'link', 'meta', 'title', 'head', 'noscript']);

    // CDP nodes are not browser DOM nodes: there is no `textContent`. The
    // previous implementation required `node.textContent?.trim()`, which is
    // always undefined on a real CDP tree, so this rule matched nothing outside
    // the mock fixtures used by the tests. Text lives in child nodes of
    // nodeType 3, under `nodeValue`.
    function directText(node) {
      if (!node.children) return '';
      return node.children
        .filter((child) => child.nodeType === 3 && typeof child.nodeValue === 'string')
        .map((child) => child.nodeValue)
        .join('')
        .trim();
    }

    function walk(node, ancestors) {
      if (!node) return;

      const nodeName = node.nodeName?.toLowerCase();
      if (SKIP.has(nodeName)) return;

      if (node.nodeType === 1 && directText(node).length > 0) {
        // Carry the ancestor chain (innermost first) so the contrast check can
        // resolve the effective background by compositing through it.
        node.ancestors = ancestors;
        node.textContent = directText(node);
        nodes.push(node);
      }

      if (node.children) {
        const nextAncestors = node.nodeType === 1 ? [node, ...ancestors] : ancestors;
        for (const child of node.children) {
          walk(child, nextAncestors);
        }
      }
    }

    walk(domTree, []);
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
