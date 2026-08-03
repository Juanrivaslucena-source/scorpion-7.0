/**
 * DOM Utilities - Helper functions for driving the page via CDP
 *
 * The audit reads the DOM through a single in-page snapshot rather than one
 * CDP round trip per node per property. A page with a few thousand elements
 * would otherwise need tens of thousands of round trips, which is both slow
 * and a source of inconsistency (styles read after a relayout).
 */

const fs = require('node:fs');

/**
 * Style properties captured for every element. Rules read these in camelCase;
 * the snapshot also exposes kebab-case aliases so either spelling works.
 */
const CAPTURED_STYLE_PROPERTIES = [
  'color',
  'backgroundColor',
  'backgroundImage',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'display',
  'visibility',
  'opacity',
  'position',
  'overflow',
  'overflowX',
  'overflowY',
  'gap',
  'columnGap',
  'rowGap',
  'width',
  'height'
];

/**
 * Serialized in-page collector. Runs inside the browser and returns a plain
 * tree of elements annotated with resolved styles, geometry and text.
 *
 * Kept in ES5-compatible style and free of outer-scope references because it
 * is stringified and evaluated in the page context.
 *
 * @param {string[]} styleProperties - Style properties to capture
 * @returns {Object} Serializable DOM snapshot
 */
function collectSnapshot(styleProperties) {
  var MAX_TEXT_LENGTH = 200;
  var SKIPPED_TAGS = {
    HEAD: true,
    TITLE: true,
    SCRIPT: true,
    STYLE: true,
    LINK: true,
    META: true,
    NOSCRIPT: true,
    TEMPLATE: true,
    BASE: true
  };
  var WHITE = { r: 255, g: 255, b: 255, a: 1 };

  function parseColor(value) {
    if (!value) return null;
    var match = String(value).match(/^rgba?\(([^)]+)\)$/);
    if (!match) return null;
    var parts = match[1].split(',').map(function (part) { return parseFloat(part); });
    if (parts.length < 3 || parts.some(isNaN)) return null;
    return {
      r: parts[0],
      g: parts[1],
      b: parts[2],
      a: parts.length > 3 ? parts[3] : 1
    };
  }

  // Flatten a translucent color onto an opaque backdrop.
  function composite(foreground, backdrop) {
    if (!foreground) return backdrop;
    if (foreground.a >= 1) {
      return { r: foreground.r, g: foreground.g, b: foreground.b, a: 1 };
    }
    var alpha = foreground.a;
    return {
      r: foreground.r * alpha + backdrop.r * (1 - alpha),
      g: foreground.g * alpha + backdrop.g * (1 - alpha),
      b: foreground.b * alpha + backdrop.b * (1 - alpha),
      a: 1
    };
  }

  function toRgbString(color) {
    return 'rgb(' + Math.round(color.r) + ', ' +
                    Math.round(color.g) + ', ' +
                    Math.round(color.b) + ')';
  }

  function toKebabCase(name) {
    return name.replace(/[A-Z]/g, function (character) {
      return '-' + character.toLowerCase();
    });
  }

  // SVG elements expose className as an SVGAnimatedString, not a string.
  function readClassName(element) {
    var value = element.getAttribute && element.getAttribute('class');
    return value ? String(value).trim() : '';
  }

  function readAttributes(element) {
    var result = [];
    var attributes = element.attributes || [];
    for (var i = 0; i < attributes.length; i++) {
      result.push({ name: attributes[i].name, value: attributes[i].value });
    }
    return result;
  }

  // Text belonging directly to this element, excluding descendants.
  function readOwnText(element) {
    var text = '';
    for (var i = 0; i < element.childNodes.length; i++) {
      var child = element.childNodes[i];
      if (child.nodeType === 3) {
        text += child.nodeValue;
      }
    }
    return text.trim();
  }

  var counter = 0;

  function walk(element, backdrop) {
    if (SKIPPED_TAGS[element.tagName ? element.tagName.toUpperCase() : '']) {
      return null;
    }

    var computed = window.getComputedStyle(element);
    var rect = element.getBoundingClientRect();

    var style = {};
    for (var i = 0; i < styleProperties.length; i++) {
      var property = styleProperties[i];
      var value = computed[property];
      style[property] = value;
      style[toKebabCase(property)] = value;
    }

    // Resolve the effective background by compositing onto the ancestor
    // backdrop, so contrast is measured against what is actually rendered
    // rather than against a transparent value.
    var ownBackground = parseColor(computed.backgroundColor);
    var resolvedBackground = composite(ownBackground, backdrop);
    var resolvedColor = composite(parseColor(computed.color), resolvedBackground);

    style.backgroundColor = toRgbString(resolvedBackground);
    style['background-color'] = style.backgroundColor;
    style.color = toRgbString(resolvedColor);

    var text = element.textContent ? element.textContent.trim() : '';

    var node = {
      nodeType: 1,
      nodeName: element.tagName ? element.tagName.toUpperCase() : 'UNKNOWN',
      nodeId: ++counter,
      id: element.id || '',
      className: readClassName(element),
      attributes: readAttributes(element),
      textContent: text.length > MAX_TEXT_LENGTH
        ? text.slice(0, MAX_TEXT_LENGTH)
        : text,
      ownText: readOwnText(element),
      style: style,
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      },
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      children: []
    };

    // Include text nodes alongside elements so rules can tell an element that
    // renders text itself from one that only contains text-bearing children.
    // Rules that only care about elements filter on nodeType === 1.
    var childNodes = element.childNodes;
    for (var j = 0; j < childNodes.length; j++) {
      var child = childNodes[j];

      if (child.nodeType === 3) {
        var value = child.nodeValue;
        if (value && value.trim().length > 0) {
          node.children.push({
            nodeType: 3,
            nodeName: '#text',
            nodeValue: value.length > MAX_TEXT_LENGTH
              ? value.slice(0, MAX_TEXT_LENGTH)
              : value,
            children: []
          });
        }
        continue;
      }

      if (child.nodeType !== 1) continue;

      var childNode = walk(child, resolvedBackground);
      if (childNode) {
        node.children.push(childNode);
      }
    }

    return node;
  }

  var root = walk(document.documentElement, WHITE);

  return {
    root: root,
    documentScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    nodeCount: counter
  };
}

/**
 * Re-attach parent references after transport. They are omitted in-page
 * because a cyclic structure cannot be serialized back over CDP.
 * @param {Object} node - Snapshot node
 * @param {Object|null} parent - Parent node
 */
function linkParents(node, parent = null) {
  if (!node) return;
  Object.defineProperty(node, 'parentNode', {
    value: parent,
    enumerable: false,
    writable: true
  });
  for (const child of node.children || []) {
    linkParents(child, node);
  }
}

/**
 * Capture a full snapshot of the current page in a single round trip.
 * @param {Object} client - CDP client
 * @returns {Promise<Object|null>} Snapshot with an annotated `root` tree
 */
async function snapshot(client) {
  if (!client) {
    return null;
  }

  const expression = `(${collectSnapshot.toString()})(${JSON.stringify(CAPTURED_STYLE_PROPERTIES)})`;

  const result = await client.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: false
  });

  if (result.exceptionDetails) {
    throw new Error(
      `Snapshot failed: ${result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text}`
    );
  }

  const value = result.result?.value;
  if (!value || !value.root) {
    return null;
  }

  linkParents(value.root);
  return value;
}

/**
 * Get computed style for an element.
 *
 * Prefers the styles captured in the snapshot; falls back to a CDP lookup for
 * nodes that came from `DOM.getDocument` instead.
 * @param {Object} client - CDP client
 * @param {Object} node - DOM node
 * @returns {Promise<Object|null>} Computed style object
 */
async function getComputedStyle(client, node) {
  if (!node) {
    return null;
  }

  if (node.style) {
    return node.style;
  }

  if (!client || node.nodeId === undefined) {
    return null;
  }

  try {
    const result = await client.send('CSS.getComputedStyleForNode', {
      nodeId: node.nodeId
    });

    if (!result.computedStyle) {
      return null;
    }

    // CDP returns [{name, value}] in kebab-case; expose both spellings.
    const style = {};
    for (const { name, value } of result.computedStyle) {
      style[name] = value;
      style[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    return style;
  } catch (error) {
    console.error('Failed to get computed style:', error.message);
    return null;
  }
}

/**
 * Get bounding rect for an element
 * @param {Object} client - CDP client
 * @param {Object} node - DOM node
 * @returns {Promise<Object|null>} Bounding rect
 */
async function getBoundingRect(client, node) {
  if (!node) {
    return null;
  }

  if (node.rect) {
    return node.rect;
  }

  if (!client || !node.backendNodeId) {
    return null;
  }

  try {
    const result = await client.send('DOM.getBoxModel', {
      backendNodeId: node.backendNodeId
    });

    if (!result.model) {
      return null;
    }

    // The border quad is [x1,y1, x2,y2, x3,y3, x4,y4] clockwise from top-left.
    const quad = result.model.border;
    return {
      x: quad[0],
      y: quad[1],
      width: quad[2] - quad[0],
      height: quad[5] - quad[1]
    };
  } catch (error) {
    console.error('Failed to get bounding rect:', error.message);
    return null;
  }
}

/**
 * Get scroll width for an element
 * @param {Object} client - CDP client
 * @param {Object} node - DOM node
 * @returns {Promise<number>} Scroll width
 */
async function getScrollWidth(client, node) {
  if (!node) {
    return 0;
  }

  if (typeof node.scrollWidth === 'number') {
    return node.scrollWidth;
  }

  if (!client || !node.backendNodeId) {
    return 0;
  }

  try {
    // scrollWidth includes overflow, so it cannot be derived from the box
    // model - it has to be read off the live element.
    const resolved = await client.send('DOM.resolveNode', {
      backendNodeId: node.backendNodeId
    });

    if (!resolved.object?.objectId) {
      return 0;
    }

    const result = await client.send('Runtime.callFunctionOn', {
      objectId: resolved.object.objectId,
      functionDeclaration: 'function () { return this.scrollWidth; }',
      returnByValue: true
    });

    await client.send('Runtime.releaseObject', {
      objectId: resolved.object.objectId
    }).catch(() => {});

    return result.result?.value ?? 0;
  } catch (error) {
    console.error('Failed to get scroll width:', error.message);
    return 0;
  }
}

/**
 * Evaluate JavaScript in the page context
 * @param {Object} client - CDP client
 * @param {string} expression - JavaScript expression
 * @returns {Promise<*>} Evaluation result
 */
async function evaluate(client, expression) {
  if (!client) {
    return null;
  }

  try {
    const result = await client.send('Runtime.evaluate', {
      expression,
      returnByValue: true
    });

    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text
      );
    }

    // Preserve falsy results (0, '', false) instead of collapsing them to null.
    return result.result?.value ?? null;
  } catch (error) {
    console.error('Failed to evaluate:', error.message);
    return null;
  }
}

/**
 * Wait for the document to finish loading.
 * @param {Object} client - CDP client
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function waitReady(client, timeout = 30000) {
  if (!client) {
    throw new Error('No CDP client provided');
  }

  const deadline = Date.now() + timeout;

  // Poll readyState rather than relying solely on Page.loadEventFired, which
  // has already fired (and will not fire again) for an alreadyloaded document.
  while (Date.now() < deadline) {
    const state = await evaluate(client, 'document.readyState');
    if (state === 'complete') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Page load timeout after ${timeout}ms`);
}

/**
 * Navigate to URL and wait for load
 * @param {Object} client - CDP client
 * @param {string} url - URL to navigate to
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function navigate(client, url, timeout = 30000) {
  if (!client) {
    throw new Error('No CDP client provided');
  }

  await client.send('Page.enable');

  const result = await client.send('Page.navigate', { url });

  if (result.errorText) {
    throw new Error(`Navigation to ${url} failed: ${result.errorText}`);
  }

  await waitReady(client, timeout);
}

/**
 * Get DOM tree via CDP
 * @param {Object} client - CDP client
 * @returns {Promise<Object|null>} DOM tree
 */
async function getDOMTree(client) {
  if (!client) {
    return null;
  }

  try {
    const captured = await snapshot(client);
    return captured?.root || null;
  } catch (error) {
    console.error('Failed to get DOM tree:', error.message);
    return null;
  }
}

/**
 * Set viewport size
 * @param {Object} client - CDP client
 * @param {number} width - Viewport width
 * @param {number} height - Viewport height
 * @param {Object} options - Emulation options
 * @returns {Promise<void>}
 */
async function setViewport(client, width, height, options = {}) {
  if (!client) {
    return;
  }

  const {
    deviceScaleFactor = 1,
    // Narrow viewports are audited as mobile so that media queries and
    // touch-target rules see what a real phone would.
    mobile = width <= 768
  } = typeof options === 'number' ? { deviceScaleFactor: options } : options;

  try {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile
    });

    await client.send('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 255, g: 255, b: 255, a: 1 }
    });
  } catch (error) {
    console.error('Failed to set viewport:', error.message);
  }
}

/**
 * Capture screenshot
 * @param {Object} client - CDP client
 * @param {string} filePath - Output file path
 * @param {Object} options - Screenshot options
 * @returns {Promise<void>}
 */
async function captureScreenshot(client, filePath, options = {}) {
  if (!client) {
    throw new Error('No CDP client provided');
  }

  const { format = 'png', quality, clip } = options;

  // CDP rejects `quality` for png and a null `clip`, so only send what applies.
  const params = { format };
  if (format === 'jpeg' && quality !== undefined) {
    params.quality = quality;
  }
  if (clip) {
    params.clip = clip;
  }

  const result = await client.send('Page.captureScreenshot', params);
  await fs.promises.writeFile(filePath, Buffer.from(result.data, 'base64'));
}

module.exports = {
  getComputedStyle,
  getBoundingRect,
  getScrollWidth,
  evaluate,
  waitReady,
  navigate,
  getDOMTree,
  setViewport,
  captureScreenshot,
  snapshot,
  CAPTURED_STYLE_PROPERTIES
};
