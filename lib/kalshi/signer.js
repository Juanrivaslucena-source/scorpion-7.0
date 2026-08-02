/**
 * Kalshi Request Signer
 *
 * Kalshi authenticates every request with an RSA-PSS signature rather than a
 * bearer token. The signed message is the concatenation of the millisecond
 * timestamp, the uppercase HTTP method, and the request path.
 *
 * The path MUST include the `/trade-api/v2` prefix and MUST NOT include the
 * query string. Getting either wrong produces a signature the exchange rejects
 * with a 401 that says nothing about which half was wrong.
 *
 * Signature parameters: RSA-PSS, SHA-256 digest, MGF1-SHA256, salt length equal
 * to the digest length (32 bytes), base64-encoded.
 */

const crypto = require('node:crypto');

const ACCESS_KEY_HEADER = 'KALSHI-ACCESS-KEY';
const ACCESS_TIMESTAMP_HEADER = 'KALSHI-ACCESS-TIMESTAMP';
const ACCESS_SIGNATURE_HEADER = 'KALSHI-ACCESS-SIGNATURE';

/**
 * Build the exact string Kalshi expects to have been signed
 * @param {number} timestampMs - Unix milliseconds
 * @param {string} method - HTTP method (case-insensitive, upcased here)
 * @param {string} path - Request path including /trade-api/v2, excluding query
 * @returns {string} The message to sign
 */
function buildSignatureMessage(timestampMs, method, path) {
  if (!Number.isInteger(timestampMs)) {
    throw new TypeError('timestampMs must be an integer number of milliseconds');
  }

  // Defensive: a caller that passes a full URL or a path with a query string
  // would produce a silently-invalid signature, so strip and validate here.
  const pathOnly = stripQuery(path);

  if (!pathOnly.startsWith('/')) {
    throw new Error(`Signature path must be absolute, got: ${path}`);
  }

  return `${timestampMs}${method.toUpperCase()}${pathOnly}`;
}

/**
 * Remove the query string and fragment from a path
 * @param {string} path - Path that may carry ?query or #fragment
 * @returns {string} Path only
 */
function stripQuery(path) {
  const queryIndex = path.indexOf('?');
  const withoutQuery = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const hashIndex = withoutQuery.indexOf('#');
  return hashIndex === -1 ? withoutQuery : withoutQuery.slice(0, hashIndex);
}

/**
 * Sign a message with an RSA private key using PSS padding
 * @param {string} message - The message produced by buildSignatureMessage
 * @param {string|Buffer} privateKeyPem - RSA private key in PEM format
 * @returns {string} Base64-encoded signature
 */
function signRequest(message, privateKeyPem) {
  if (!privateKeyPem) {
    throw new Error('A private key is required to sign Kalshi requests');
  }

  return crypto
    .sign('sha256', Buffer.from(message, 'utf8'), {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    })
    .toString('base64');
}

/**
 * Verify a signature. Used by the test suite to round-trip signRequest without
 * needing network access or real credentials.
 * @param {string} message - The signed message
 * @param {string} signatureBase64 - Base64 signature
 * @param {string|Buffer} publicKeyPem - RSA public key in PEM format
 * @returns {boolean} Whether the signature is valid
 */
function verifySignature(message, signatureBase64, publicKeyPem) {
  return crypto.verify(
    'sha256',
    Buffer.from(message, 'utf8'),
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    },
    Buffer.from(signatureBase64, 'base64')
  );
}

/**
 * Build the three authentication headers for a request
 * @param {Object} options
 * @param {string} options.keyId - Kalshi API key ID
 * @param {string|Buffer} options.privateKeyPem - RSA private key in PEM format
 * @param {string} options.method - HTTP method
 * @param {string} options.path - Request path including /trade-api/v2, excluding query
 * @param {number} [options.now] - Unix milliseconds; injectable for tests
 * @returns {Object} Headers to merge into the request
 */
function buildAuthHeaders({ keyId, privateKeyPem, method, path, now = Date.now() }) {
  if (!keyId) {
    throw new Error('A Kalshi API key ID is required (KALSHI_API_KEY_ID)');
  }

  const timestampMs = Math.floor(now);
  const message = buildSignatureMessage(timestampMs, method, path);

  return {
    [ACCESS_KEY_HEADER]: keyId,
    [ACCESS_TIMESTAMP_HEADER]: String(timestampMs),
    [ACCESS_SIGNATURE_HEADER]: signRequest(message, privateKeyPem)
  };
}

module.exports = {
  buildAuthHeaders,
  buildSignatureMessage,
  signRequest,
  verifySignature,
  stripQuery,
  ACCESS_KEY_HEADER,
  ACCESS_TIMESTAMP_HEADER,
  ACCESS_SIGNATURE_HEADER
};
