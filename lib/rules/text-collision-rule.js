/**
 * Text Collision Rule - Detects overlapping text elements
 * 
 * Uses spatial bucketing by parent to optimize O(n²) collision detection.
 * Only checks text elements within the same parent container.
 */

/**
 * Text Collision audit rule
 */
class TextCollisionRule {
  constructor() {
    this.id = 'text-collision';
    this.name = 'Text Collision';
    this.description = 'Text elements should not overlap';
    this.severity = 'error';
    this.findings = [];
    this.COLLISION_THRESHOLD = 0.1; // 10% overlap threshold (reduced from 50%)
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
    
    // Get all text elements grouped by parent
    const textElementsByParent = this._groupTextElementsByParent(domTree);
    
    // Check collisions within each parent group
    for (const [parent, textElements] of textElementsByParent) {
      await this._checkCollisionsInGroup(textElements, getComputedStyle, context);
    }
    
    return this.findings;
  }

  /**
   * Group text elements by their parent
   * @param {Object} domTree - DOM tree
   * @returns {Map} Text elements grouped by parent
   */
  _groupTextElementsByParent(domTree) {
    const groups = new Map();
    
    function walk(node, parent = null) {
      if (!node || node.nodeType !== 1) return; // Only element nodes
      
      // Skip non-text elements
      const nodeName = node.nodeName?.toLowerCase();
      if (nodeName === 'script' || nodeName === 'style' || 
          nodeName === 'link' || nodeName === 'meta' ||
          nodeName === 'head' || nodeName === 'title' ||
          nodeName === 'svg' || nodeName === 'img') {
        return;
      }
      
      // Check if this element has text
      const hasText = node.textContent?.trim().length > 0;
      
      if (hasText) {
        // Key on node identity, not id/class/tag: every `.container` on the page
        // would otherwise share one bucket and be compared for overlap.
        const parentKey = parent
          ? (parent.backendNodeId ?? parent.nodeId ?? parent)
          : 'root';
        if (!groups.has(parentKey)) {
          groups.set(parentKey, []);
        }
        groups.get(parentKey).push({ element: node, parent });
      }
      
      // Recurse into children
      if (node.children) {
        for (const child of node.children) {
          walk(child, node);
        }
      }
    }
    
    walk(domTree);
    return groups;
  }

  /**
   * Check collisions within a group of text elements
   * @param {Array} textElements - Text elements in the same parent
   * @param {Function} getComputedStyle - Function to get computed styles
   * @param {Object} context - Audit context
   */
  async _checkCollisionsInGroup(textElements, getComputedStyle, context) {
    const rects = [];
    
    // Get bounding rects for all text elements
    for (const { element } of textElements) {
      const computedStyle = await getComputedStyle(element);
      
      if (!computedStyle) continue;
      
      // Skip hidden elements
      if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
        continue;
      }
      
      const rect = await context.getBoundingRect?.(element);
      
      if (!rect || rect.width === 0 || rect.height === 0) continue;
      
      rects.push({
        element,
        rect,
        computedStyle
      });
    }
    
    // Check all pairs for collisions (O(n²) but within same parent, so manageable)
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        
        if (this._checkCollision(a.rect, b.rect)) {
          this.findings.push({
            rule: this.id,
            severity: this.severity,
            element: this._getElementSelector(a.element),
            collidingElement: this._getElementSelector(b.element),
            message: `Text elements overlap: ${this._getElementSelector(a.element)} and ${this._getElementSelector(b.element)}`,
            overlap: this._calculateOverlap(a.rect, b.rect)
          });
        }
      }
    }
  }

  /**
   * Check if two rectangles collide
   * @param {Object} rectA - First rectangle
   * @param {Object} rectB - Second rectangle
   * @returns {boolean}
   */
  _checkCollision(rectA, rectB) {
    // Check if rectangles overlap at all
    const xOverlap = Math.max(0, 
      Math.min(rectA.x + rectA.width, rectB.x + rectB.width) - 
      Math.max(rectA.x, rectB.x));
    
    const yOverlap = Math.max(0, 
      Math.min(rectA.y + rectA.height, rectB.y + rectB.height) - 
      Math.max(rectA.y, rectB.y));
    
    // If there's any overlap at all, consider it a collision
    // (We use > 0 instead of checking ratio to catch any overlap)
    return xOverlap > 0 && yOverlap > 0;
  }

  /**
   * Calculate overlap percentage
   * @param {Object} rectA - First rectangle
   * @param {Object} rectB - Second rectangle
   * @returns {number} Overlap percentage
   */
  _calculateOverlap(rectA, rectB) {
    const xOverlap = Math.max(0, 
      Math.min(rectA.x + rectA.width, rectB.x + rectB.width) - 
      Math.max(rectA.x, rectB.x));
    
    const yOverlap = Math.max(0, 
      Math.min(rectA.y + rectA.height, rectB.y + rectB.height) - 
      Math.max(rectA.y, rectB.y));
    
    const overlapArea = xOverlap * yOverlap;
    const minArea = Math.min(rectA.width * rectA.height, rectB.width * rectB.height);
    
    return (overlapArea / minArea) * 100;
  }

  /**
   * Get CSS selector for element
   * @param {Object} element - DOM element
   * @returns {string} CSS selector
   */
  _getElementSelector(element) {
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

module.exports = { TextCollisionRule };
