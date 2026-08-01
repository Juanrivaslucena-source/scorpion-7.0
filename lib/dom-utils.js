/**
 * DOM Utilities - Helper functions for DOM manipulation via CDP
 */

/**
 * Get computed style for an element via CDP
 * @param {Object} client - CDP client
 * @param {Object} node - DOM node
 * @returns {Promise<Object>} Computed style object
 */
async function getComputedStyle(client, node) {
  if (!client || !node) {
    return null;
  }

  // CSS.getComputedStyleForNode takes a frontend nodeId, not a backendNodeId.
  const nodeId = node.nodeId ?? (await resolveNodeId(client, node));
  if (!nodeId) {
    return null;
  }

  try {
    const result = await client.send('CSS.getComputedStyleForNode', { nodeId });

    if (!Array.isArray(result.computedStyle)) {
      return null;
    }

    // CDP returns [{ name, value }] with kebab-case names. Expose both spellings,
    // as CSSStyleDeclaration does, so rules can use either.
    const style = {};
    for (const { name, value } of result.computedStyle) {
      style[name] = value;
      const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (camel !== name) {
        style[camel] = value;
      }
    }
    return style;
  } catch (error) {
    console.error('Failed to get computed style:', error.message);
    return null;
  }
}

/**
 * Map a backendNodeId to a frontend nodeId
 * @param {Object} client - CDP client
 * @param {Object} node - DOM node
 * @returns {Promise<number|null>} Frontend node id
 */
async function resolveNodeId(client, node) {
  if (!node.backendNodeId) {
    return null;
  }

  try {
    const result = await client.send('DOM.pushNodesByBackendIdsToFrontend', {
      backendNodeIds: [node.backendNodeId]
    });
    return result.nodeIds?.[0] || null;
  } catch (error) {
    console.error('Failed to resolve node id:', error.message);
    return null;
  }
}

/**
 * Read properties from a live element by evaluating against its JS handle
 * @param {Object} client - CDP client
 * @param {Object} node - DOM node
 * @param {string} functionDeclaration - Function to call with the element as `this`
 * @returns {Promise<*>} Returned value, or null on failure
 */
async function callOnNode(client, node, functionDeclaration) {
  if (!client || !node || !node.backendNodeId) {
    return null;
  }

  let objectId = null;
  try {
    const resolved = await client.send('DOM.resolveNode', {
      backendNodeId: node.backendNodeId
    });
    objectId = resolved.object?.objectId;
    if (!objectId) {
      return null;
    }

    const result = await client.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration,
      returnByValue: true
    });

    return result.result?.value ?? null;
  } catch (error) {
    console.error('Failed to read node property:', error.message);
    return null;
  } finally {
    if (objectId) {
      await client.send('Runtime.releaseObject', { objectId }).catch(() => {});
    }
  }
}

/**
 * Get bounding rect for an element via CDP
 * @param {Object} client - CDP client
 * @param {Object} node - DOM node
 * @returns {Promise<Object>} Bounding rect
 */
async function getBoundingRect(client, node) {
  if (!client || !node || !node.backendNodeId) {
    return null;
  }

  try {
    const result = await client.send('DOM.getBoxModel', {
      backendNodeId: node.backendNodeId
    });
    
    if (!result.model) {
      return null;
    }
    
    // Convert box model to simple rect
    return {
      x: result.model.content[0],
      y: result.model.content[1],
      width: result.model.content[2] - result.model.content[0],
      height: result.model.content[5] - result.model.content[1]
    };
  } catch (error) {
    console.error('Failed to get bounding rect:', error.message);
    return null;
  }
}

/**
 * Get scroll width for an element via CDP
 * @param {Object} client - CDP client
 * @param {Object} node - DOM node
 * @returns {Promise<number>} Scroll width
 */
async function getScrollWidth(client, node) {
  // Must come from the element itself: the box model reports the rendered box,
  // which by definition never exceeds clientWidth and so can never signal overflow.
  const value = await callOnNode(client, node, 'function () { return this.scrollWidth; }');
  return typeof value === 'number' ? value : 0;
}

/**
 * Get client width for an element via CDP
 * @param {Object} client - CDP client
 * @param {Object} node - DOM node
 * @returns {Promise<number>} Client width
 */
async function getClientWidth(client, node) {
  const value = await callOnNode(client, node, 'function () { return this.clientWidth; }');
  return typeof value === 'number' ? value : 0;
}

/**
 * Evaluate JavaScript in the page context
 * @param {Object} client - CDP client
 * @param {string} expression - JavaScript expression
 * @returns {Promise<Object>} Evaluation result
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
    
    return result.result?.value || null;
  } catch (error) {
    console.error('Failed to evaluate:', error.message);
    return null;
  }
}

/**
 * Wait for page to be ready
 * @param {Object} client - CDP client
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function waitReady(client, timeout = 30000) {
  if (!client) {
    throw new Error('No CDP client provided');
  }

  // Wait for the load event. Note: Page.getNavigationHistory succeeds whatever
  // the load state is, so it cannot be used to detect an already-loaded page.
  await new Promise((resolve, reject) => {
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      clearInterval(pollId);
      client.off('Page.loadEventFired', onLoad);
      fn(value);
    };

    const onLoad = () => finish(resolve);

    client.on('Page.loadEventFired', onLoad);

    const timeoutId = setTimeout(() => {
      finish(reject, new Error(`Page load timeout after ${timeout}ms`));
    }, timeout);

    // The load event may have fired before this listener was attached, so also
    // poll readyState as a backstop.
    const pollId = setInterval(() => {
      client.send('Runtime.evaluate', {
        expression: 'document.readyState',
        returnByValue: true
      }).then((result) => {
        if (result.result?.value === 'complete') {
          finish(resolve);
        }
      }).catch(() => {
        // Navigation in flight; try again on the next tick.
      });
    }, 100);
  });

  // Let layout settle after load.
  await new Promise(resolve => setTimeout(resolve, 100));
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

  // Enable Page domain
  await client.send('Page.enable');
  
  // Navigate
  await client.send('Page.navigate', { url });
  
  // Wait for load
  await waitReady(client, timeout);
}

/**
 * Get DOM tree via CDP
 * @param {Object} client - CDP client
 * @returns {Promise<Object>} DOM tree
 */
async function getDOMTree(client) {
  if (!client) {
    return null;
  }

  try {
    // Enable DOM domain
    await client.send('DOM.enable');
    
    // Get document
    const result = await client.send('DOM.getDocument', {
      depth: -1, // Full tree
      pierce: true
    });

    if (!result.root) {
      return null;
    }

    const root = normalizeDOMTree(result.root);

    // DOM.getDocument returns the #document node (nodeType 9). Rules walk from
    // an element root and stop at anything that is not nodeType 1, so hand back
    // the document element instead.
    if (root.nodeType === 9) {
      return (root.children || []).find(child => child.nodeType === 1) || root;
    }

    return root;
  } catch (error) {
    console.error('Failed to get DOM tree:', error.message);
    return null;
  }
}

/**
 * Normalize a CDP node tree into the shape the audit rules expect.
 *
 * CDP nodes carry attributes as a flat [name, value, ...] array and have no
 * textContent; the rules index nodes like browser DOM elements. Normalizing
 * once here keeps that translation out of every rule.
 *
 * @param {Object} root - Root node from DOM.getDocument
 * @returns {Object} The same tree, annotated in place
 */
function normalizeDOMTree(root) {
  function walk(node, parent) {
    if (!node) return '';

    // Non-enumerable: the tree is walked and occasionally serialized, and an
    // enumerable back-reference would make it cyclic.
    Object.defineProperty(node, 'parentNode', {
      value: parent || null,
      enumerable: false,
      configurable: true,
      writable: true
    });

    if (node.attributes) {
      const attrs = {};
      for (let i = 0; i < node.attributes.length; i += 2) {
        attrs[node.attributes[i]] = node.attributes[i + 1];
      }
      node.attrs = attrs;
      if (attrs.id) node.id = attrs.id;
      if (attrs.class) node.className = attrs.class;
    }

    // Text nodes contribute their value; elements accumulate their descendants'.
    if (node.nodeType === 3) {
      return node.nodeValue || '';
    }

    let text = '';
    for (const child of node.children || []) {
      text += walk(child, node);
    }
    for (const shadowRoot of node.shadowRoots || []) {
      text += walk(shadowRoot, node);
    }
    if (node.contentDocument) {
      walk(node.contentDocument, node);
    }

    node.textContent = text;
    return text;
  }

  walk(root, null);
  return root;
}

/**
 * Set viewport size
 * @param {Object} client - CDP client
 * @param {number} width - Viewport width
 * @param {number} height - Viewport height
 * @param {number} deviceScaleFactor - Device scale factor
 * @returns {Promise<void>}
 */
async function setViewport(client, width, height, deviceScaleFactor = 1) {
  if (!client) {
    return;
  }

  try {
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile: false
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

  const {
    format = 'png',
    quality = 100,
    clip = null
  } = options;

  try {
    const params = { format };
    // CDP rejects a null clip, and ignores quality outside jpeg/webp.
    if (clip) params.clip = clip;
    if (format !== 'png') params.quality = quality;

    const result = await client.send('Page.captureScreenshot', params);

    const buffer = Buffer.from(result.data, 'base64');
    await require('node:fs').promises.writeFile(filePath, buffer);
  } catch (error) {
    console.error('Failed to capture screenshot:', error.message);
    throw error;
  }
}

module.exports = {
  getComputedStyle,
  getBoundingRect,
  getScrollWidth,
  getClientWidth,
  resolveNodeId,
  callOnNode,
  evaluate,
  waitReady,
  navigate,
  getDOMTree,
  normalizeDOMTree,
  setViewport,
  captureScreenshot
};
