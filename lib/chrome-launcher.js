/**
 * Chrome Launcher - starts headless Chromium and discovers its real CDP endpoint.
 *
 * Replaces the previous approach, which passed `--remote-debugging-port=0` (telling
 * Chrome to pick a random port), slept 1000ms, then connected to a hardcoded
 * `ws://localhost:9222/devtools/browser/00000000-0000-0000-0000-000000000000`.
 * That UUID was invented and the port was wrong, so the endpoint never existed.
 *
 * Discovery strategy, in order of preference:
 *   1. `DevToolsActivePort` inside a throwaway --user-data-dir. Chrome writes it
 *      only after the debugging socket is bound, so it doubles as the readiness
 *      signal and removes the need for a sleep. Line 1 is the port; line 2 is the
 *      browser WebSocket path including the real UUID.
 *   2. The `DevTools listening on ws://...` line on stderr, as a fallback for
 *      builds that write the file late or not at all.
 *
 * A fixed port is deliberately not used: it collides with concurrent audit runs
 * and, without an isolated profile, can attach to a developer's own running
 * Chrome and their live browsing profile.
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_LAUNCH_TIMEOUT_MS = 20000;
const POLL_INTERVAL_MS = 50;
const STDERR_CAP_BYTES = 32768;

const DEFAULT_ARGS = [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-client-side-phishing-detection',
  '--disable-default-apps',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-sync',
  '--metrics-recording-only',
  '--mute-audio',
  '--use-gl=swiftshader',
];

/**
 * Parse a DevToolsActivePort file body.
 * Returns null when the file is present but not yet fully written — Chrome
 * creates it before both lines land, so a partial read must not be trusted.
 *
 * @param {string} body
 * @returns {{port: number, wsPath: string}|null}
 */
function parseDevToolsActivePort(body) {
  if (!body) return null;
  const [rawPort, rawPath] = body.split('\n');
  const port = Number((rawPort ?? '').trim());
  const wsPath = (rawPath ?? '').trim();
  if (!Number.isInteger(port) || port <= 0) return null;
  if (!wsPath.startsWith('/devtools/')) return null;
  return { port, wsPath };
}

/**
 * Extract the browser WebSocket URL from Chrome's stderr.
 * @param {string} stderr
 * @returns {string|null}
 */
function parseStderrWsUrl(stderr) {
  const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr || '');
  return match ? match[1] : null;
}

/**
 * Terminate a child process and resolve once it has actually exited.
 * Escalates to SIGKILL if it ignores SIGTERM.
 *
 * @param {import('node:child_process').ChildProcess} child
 * @param {number} [graceMs]
 * @returns {Promise<void>}
 */
function signalGroup(child, signal) {
  // Negative pid targets the whole process group (see `detached: true` at spawn),
  // which is what actually reaches Chrome's zygote and renderer children.
  try {
    process.kill(-child.pid, signal);
    return;
  } catch { /* group may already be gone; fall back to the direct child */ }
  try { child.kill(signal); } catch { /* already gone */ }
}

function stopProcess(child, graceMs = 3000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    signalGroup(child, 'SIGKILL'); // reap any orphaned children
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => { clearTimeout(killTimer); resolve(); };
    const killTimer = setTimeout(() => signalGroup(child, 'SIGKILL'), graceMs);
    killTimer.unref?.();

    child.once('exit', () => {
      // Children can outlive the parent; sweep the group before resolving.
      signalGroup(child, 'SIGKILL');
      done();
    });
    signalGroup(child, 'SIGTERM');
  });
}

/**
 * Launch Chromium and resolve once its CDP endpoint is known and listening.
 *
 * @param {string} executablePath - Chromium binary
 * @param {Object} [options]
 * @param {number} [options.timeoutMs]
 * @param {string[]} [options.args] - extra Chromium flags
 * @returns {Promise<{process: ChildProcess, wsUrl: string, port: number, userDataDir: string, dispose: Function}>}
 */
async function launchChrome(executablePath, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS;
  const userDataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'scorpion-cdp-'));

  const child = spawn(executablePath, [
    ...DEFAULT_ARGS,
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    ...(options.args ?? []),
    'about:blank',
    // Own process group, so termination can reach Chrome's zygote and renderer
    // children. Signalling the launcher alone leaves them running.
  ], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });

  // Keep stderr drained and bounded. Chrome is chatty; an unread pipe can
  // eventually block the child, and the tail is what we need for diagnostics.
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-STDERR_CAP_BYTES);
  });
  child.stdout.resume();

  let exitInfo = null;
  child.once('exit', (code, signal) => { exitInfo = { code, signal }; });

  const cleanupSync = () => {
    signalGroup(child, 'SIGKILL');
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* gone */ }
  };
  // Guarantee no orphaned Chrome and no leaked profile if the audit dies.
  process.once('exit', cleanupSync);

  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      if (exitInfo) {
        throw new Error(
          `Chromium exited before the CDP endpoint was ready ` +
          `(code=${exitInfo.code}, signal=${exitInfo.signal}).\n${stderr}`
        );
      }

      let body = null;
      try {
        body = await fsp.readFile(portFile, 'utf8');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      const parsed = parseDevToolsActivePort(body);
      if (parsed) {
        // 127.0.0.1, never `localhost`: localhost may resolve to ::1 while
        // Chrome binds IPv4 only, which surfaces as a confusing ECONNREFUSED.
        return finish(`ws://127.0.0.1:${parsed.port}${parsed.wsPath}`, parsed.port);
      }

      const stderrUrl = parseStderrWsUrl(stderr);
      if (stderrUrl) {
        return finish(stderrUrl, Number(new URL(stderrUrl).port));
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for Chromium's CDP endpoint.\n` +
      `Expected ${portFile} to contain a port and a /devtools/ path.\n${stderr}`
    );
  } catch (error) {
    cleanupSync();
    process.removeListener('exit', cleanupSync);
    throw error;
  }

  function finish(wsUrl, port) {
    return {
      process: child,
      wsUrl,
      port,
      userDataDir,
      getStderr: () => stderr,
      dispose: async () => {
        process.removeListener('exit', cleanupSync);
        // Wait for Chromium to actually exit before deleting its profile.
        // Removing the directory while it is still writing leaves debris behind.
        await stopProcess(child);
        try {
          await fsp.rm(userDataDir, { recursive: true, force: true });
        } catch { /* best effort */ }
      },
    };
  }
}

module.exports = {
  launchChrome,
  parseDevToolsActivePort,
  parseStderrWsUrl,
  DEFAULT_ARGS,
};
