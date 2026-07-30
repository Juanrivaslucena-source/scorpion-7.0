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
  if (!client || !node || node.nodeId === undefined) {
    return null;
  }

  try {
    // CSS.getComputedStyleForNode takes a *nodeId*. This previously passed
    // `nodeId: node.backendNodeId` — a different ID space entirely — so every
    // style lookup failed with "Could not find node with given id". The bug was
    // invisible while the browser layer was mocked, because it never ran.
    const result = await client.send('CSS.getComputedStyleForNode', {
      nodeId: node.nodeId
    });
    
    if (!result.computedStyle) return null;

    // CDP returns an array of {name, value} pairs with kebab-case names, but the
    // rules read camelCase properties (computedStyle.backgroundColor). Without
    // this conversion every lookup is undefined, which the contrast rule then
    // treated as "no color" and skipped — another silent source of zero findings.
    const style = {};
    for (const { name, value } of result.computedStyle) {
      style[name] = value;
      const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (camel !== name) style[camel] = value;
    }
    return style;
  } catch (error) {
    console.error('Failed to get computed style:', error.message);
    return null;
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
  if (!client || !node || !node.backendNodeId) {
    return 0;
  }

  try {
    const result = await client.send('DOM.getBoxModel', {
      backendNodeId: node.backendNodeId
    });
    
    if (!result.model) {
      return 0;
    }
    
    // scrollWidth is the width including overflow
    // For now, return the content width (this is a simplification)
    return result.model.content[2] - result.model.content[0];
  } catch (error) {
    console.error('Failed to get scroll width:', error.message);
    return 0;
  }
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

  const startTime = Date.now();
  
  // Wait for load event
  await new Promise((resolve, reject) => {
    const onLoad = () => {
      client.off('Page.loadEventFired', onLoad);
      resolve();
    };
    
    client.on('Page.loadEventFired', onLoad);
    
    // Also set a timeout
    const timeoutId = setTimeout(() => {
      client.off('Page.loadEventFired', onLoad);
      reject(new Error(`Page load timeout after ${timeout}ms`));
    }, timeout);
    
    // Check if already loaded
    client.send('Page.getNavigationHistory').then(() => {
      // If we get here without error, page is likely loaded
      client.off('Page.loadEventFired', onLoad);
      clearTimeout(timeoutId);
      resolve();
    }).catch(() => {
      // Ignore and wait for load event
    });
  });
  
  // Additional wait for DOM to be ready
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
    
    return result.root || null;
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
    // Only send parameters that are actually set. Passing `clip: null` makes
    // Chromium reject the command outright ("Failed to deserialize params.clip"),
    // and `quality` is only meaningful for jpeg/webp — for png it is ignored at
    // best and rejected at worst.
    const params = { format };
    if (format !== 'png') params.quality = quality;
    if (clip) params.clip = clip;

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
  evaluate,
  waitReady,
  navigate,
  getDOMTree,
  setViewport,
  captureScreenshot
};
