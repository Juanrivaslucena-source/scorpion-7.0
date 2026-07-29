/**
 * scripts/lib/browser-provision.js
 * Finds a usable Chromium, or fetches one into a local cache.
 *
 * Resolution order:
 *   1. CHROMIUM_PATH environment variable
 *   2. A previously provisioned copy in .cache/chromium/
 *   3. A system install (chromium, google-chrome, Edge, macOS Chrome)
 *   4. Download @sparticuz/chromium from npm and extract it
 *
 * Step 4 is what makes this work on a bare container: that package ships a
 * brotli-compressed Chromium plus the shared libraries it needs, so we never
 * depend on apt or a Playwright browser download.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, '.cache', 'chromium');
const BIN_PATH = path.join(CACHE_DIR, 'chromium');
const LIB_PATH = path.join(CACHE_DIR, 'lib');
const MARKER = path.join(CACHE_DIR, '.provisioned.json');

const SYSTEM_CANDIDATES = [
  process.env.CHROME_PATH,
  'chromium',
  'chromium-browser',
  'google-chrome',
  'google-chrome-stable',
  'microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

function which(cmd) {
  if (cmd.includes(path.sep) || cmd.includes('/')) {
    return fs.existsSync(cmd) ? cmd : null;
  }
  try {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    return execFileSync(finder, [cmd], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim().split('\n')[0] || null;
  } catch { return null; }
}

/** Does this binary actually start? Catches missing shared libraries. */
function runnable(bin, libraryPath) {
  try {
    const env = { ...process.env };
    if (libraryPath) {
      env.LD_LIBRARY_PATH = [libraryPath, env.LD_LIBRARY_PATH].filter(Boolean).join(':');
    }
    execFileSync(bin, ['--version'], { env, stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
    return true;
  } catch { return false; }
}

function cached() {
  if (!fs.existsSync(MARKER) || !fs.existsSync(BIN_PATH)) return null;
  const libraryPath = fs.existsSync(LIB_PATH) ? LIB_PATH : null;
  if (!runnable(BIN_PATH, libraryPath)) return null;
  return { executablePath: BIN_PATH, libraryPath, source: 'cache' };
}

function system() {
  for (const candidate of SYSTEM_CANDIDATES) {
    const resolved = which(candidate);
    if (resolved && runnable(resolved, null)) {
      return { executablePath: resolved, libraryPath: null, source: 'system' };
    }
  }
  return null;
}

/** Download @sparticuz/chromium into a temp dir and extract into the cache. */
function download({ log = console.log, version = '131.0.0' } = {}) {
  if (process.platform !== 'linux') {
    throw new Error(
      `No Chromium found. Automatic download only supports Linux (this is ${process.platform}).\n` +
      'Install Chrome/Chromium, or set CHROMIUM_PATH to an existing binary.'
    );
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scorpion-chromium-'));
  log(`  fetching @sparticuz/chromium@${version} from npm...`);

  execFileSync('npm', [
    'install', `@sparticuz/chromium@${version}`,
    '--no-audit', '--no-fund', '--no-save', '--loglevel', 'error',
    '--prefix', tmp,
  ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });

  const binDir = path.join(tmp, 'node_modules', '@sparticuz', 'chromium', 'bin');
  if (!fs.existsSync(binDir)) throw new Error('npm package did not contain a bin/ directory.');

  fs.mkdirSync(CACHE_DIR, { recursive: true });

  log('  decompressing chromium binary...');
  const brotli = fs.readFileSync(path.join(binDir, 'chromium.br'));
  fs.writeFileSync(BIN_PATH, zlib.brotliDecompressSync(brotli));
  fs.chmodSync(BIN_PATH, 0o755);

  // Shared libraries (libnss3 et al) ship as brotli-compressed tarballs.
  log('  extracting shared libraries...');
  const libsRoot = path.join(CACHE_DIR, '_libs');
  fs.mkdirSync(libsRoot, { recursive: true });
  for (const archive of ['al2023.tar.br', 'al2.tar.br', 'fonts.tar.br']) {
    const source = path.join(binDir, archive);
    if (!fs.existsSync(source)) continue;
    const tarPath = path.join(libsRoot, archive.replace(/\.br$/, ''));
    fs.writeFileSync(tarPath, zlib.brotliDecompressSync(fs.readFileSync(source)));
    try {
      execFileSync('tar', ['xf', tarPath, '-C', libsRoot], { stdio: 'ignore' });
    } catch { /* some archives are optional */ }
    fs.rmSync(tarPath, { force: true });
  }

  // The .so files land in a nested lib/ directory; flatten to .cache/chromium/lib.
  const nested = path.join(libsRoot, 'lib');
  fs.mkdirSync(LIB_PATH, { recursive: true });
  if (fs.existsSync(nested)) {
    for (const file of fs.readdirSync(nested)) {
      fs.copyFileSync(path.join(nested, file), path.join(LIB_PATH, file));
    }
  }

  fs.rmSync(libsRoot, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });

  const libraryPath = fs.existsSync(LIB_PATH) && fs.readdirSync(LIB_PATH).length ? LIB_PATH : null;
  if (!runnable(BIN_PATH, libraryPath)) {
    throw new Error('Downloaded Chromium will not start (missing system libraries).');
  }

  fs.writeFileSync(MARKER, JSON.stringify({
    version, provisionedAt: new Date().toISOString(), libraryPath,
  }, null, 2));

  return { executablePath: BIN_PATH, libraryPath, source: 'downloaded' };
}

/**
 * Resolve a usable Chromium.
 * @param {object} opts - {allowDownload, log}
 */
function resolveBrowser(opts = {}) {
  const { allowDownload = true, log = () => {} } = opts;

  if (process.env.CHROMIUM_PATH) {
    const bin = process.env.CHROMIUM_PATH;
    const lib = process.env.CHROMIUM_LIB_PATH || null;
    if (!runnable(bin, lib)) {
      throw new Error(`CHROMIUM_PATH="${bin}" is not a runnable browser.`);
    }
    return { executablePath: bin, libraryPath: lib, source: 'CHROMIUM_PATH' };
  }

  const fromCache = cached();
  if (fromCache) return fromCache;

  const fromSystem = system();
  if (fromSystem) return fromSystem;

  if (!allowDownload) {
    throw new Error('No Chromium available and downloads are disabled (--no-download).');
  }

  log('No Chromium found. Provisioning one (first run only)...');
  const result = download({ log });
  log(`  cached at ${path.relative(ROOT, BIN_PATH)}`);
  return result;
}

module.exports = { resolveBrowser, CACHE_DIR, BIN_PATH };
