/**
 * Portable Chromium resolution.
 *
 * This repo runs in two very different places: a container that pre-installs
 * browsers under /opt/pw-browsers, and GitHub Actions where `playwright install`
 * drops them in ~/.cache/ms-playwright. Hard-coding either path makes the other
 * fail, so resolve at runtime and let Playwright's own lookup be the fallback.
 */
import fs from "fs";
import path from "path";
import os from "os";

const CANDIDATE_ROOTS = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  "/opt/pw-browsers",
  path.join(os.homedir(), ".cache/ms-playwright"),
  path.join(os.homedir(), "Library/Caches/ms-playwright"),
].filter(Boolean);

const BINARIES = [
  ["chrome-linux", "chrome"],
  ["chrome-linux", "headless_shell"],
  ["chrome-mac", "Chromium.app/Contents/MacOS/Chromium"],
  ["chrome-win", "chrome.exe"],
];

/**
 * @returns {string|undefined} an executable path, or undefined to let
 * Playwright resolve its own bundled browser.
 */
export function chromiumPath() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }
  for (const root of CANDIDATE_ROOTS) {
    if (!fs.existsSync(root)) continue;
    let dirs;
    try { dirs = fs.readdirSync(root); } catch { continue; }
    // Prefer a full chromium build over the headless shell: the shell cannot
    // record video, which the content engine depends on.
    const ordered = [
      ...dirs.filter((d) => /^chromium-/.test(d)),
      ...dirs.filter((d) => /^chromium_headless_shell/.test(d)),
    ];
    for (const d of ordered) {
      for (const parts of BINARIES) {
        const full = path.join(root, d, ...parts);
        if (fs.existsSync(full)) return full;
      }
    }
  }
  for (const sys of ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]) {
    if (fs.existsSync(sys)) return sys;
  }
  return undefined; // Playwright falls back to its own resolution.
}

/** Launch options that work in a container and in CI alike. */
export function launchOptions(extra = {}) {
  const executablePath = chromiumPath();
  return {
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...extra,
  };
}
