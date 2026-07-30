/**
 * Browser Resolver - Finds or provisions Chromium for CDP
 * 
 * Priority order:
 * 1. System Chromium/Chrome (CHROME_PATH env or common locations)
 * 2. npm-installed Chromium (via @puppeteer/browsers if available)
 * 3. Download and cache Chromium in .cache/
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { CDPClient } = require('./cdp-client');

// Known system browser paths
const SYSTEM_BROWSERS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/local/bin/chromium',
    '/usr/local/bin/chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ],
  linux: [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/opt/google/chrome/google-chrome',
    '/usr/local/bin/chromium',
    '/usr/local/bin/chrome'
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    'C:\\Users\\Public\\AppData\\Local\\Chromium\\Application\\chrome.exe'
  ]
};

/**
 * BrowserResolver - Manages browser discovery and provisioning
 */
class BrowserResolver {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'chromium');
    this.platform = os.platform();
    this.arch = os.arch();
    this.customPath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
  }

  /**
   * Resolve browser executable path
   * @returns {Promise<string>} Path to Chromium executable
   */
  async resolve() {
    // 1. Check custom path
    if (this.customPath && await this._exists(this.customPath)) {
      return this.customPath;
    }

    // 2. Check system browsers
    const systemPath = await this._findSystemBrowser();
    if (systemPath) {
      return systemPath;
    }

    // 3. Try npm-installed browsers
    const npmPath = await this._findNpmBrowser();
    if (npmPath) {
      return npmPath;
    }

    // 4. Download and cache
    return await this._downloadBrowser();
  }

  /**
   * Check if file exists and is executable
   * @param {string} filePath
   * @returns {Promise<boolean>}
   */
  async _exists(filePath) {
    try {
      const stats = await fs.promises.stat(filePath);
      return stats.isFile() && (this.platform !== 'win32' ? stats.mode & 0o111 : true);
    } catch {
      return false;
    }
  }

  /**
   * Find system-installed browser
   * @returns {Promise<string|null>}
   */
  async _findSystemBrowser() {
    const paths = SYSTEM_BROWSERS[this.platform] || [];
    
    for (const p of paths) {
      if (await this._exists(p)) {
        return p;
      }
    }

    // Also check PATH
    const whichResult = spawnSync('which', ['chromium-browser', 'chromium', 'google-chrome', 'chrome'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    
    if (whichResult.stdout && !whichResult.error) {
      const foundPath = whichResult.stdout.trim().split('\n')[0];
      if (await this._exists(foundPath)) {
        return foundPath;
      }
    }

    return null;
  }

  /**
   * Find npm-installed browser (via @puppeteer/browsers)
   * @returns {Promise<string|null>}
   */
  async _findNpmBrowser() {
    try {
      // Check if @puppeteer/browsers is available
      const browsersPkg = require.resolve('@puppeteer/browsers', {
        paths: [process.cwd()]
      });
      
      const { getInstalledBrowsers, getBrowserPath } = require(browsersPkg);
      const installed = await getInstalledBrowsers();
      
      for (const browser of installed) {
        if (browser.name === 'chromium') {
          const browserPath = getBrowserPath({ browser, platform: this.platform });
          if (await this._exists(browserPath)) {
            return browserPath;
          }
        }
      }
    } catch {
      // @puppeteer/browsers not available
    }
    
    return null;
  }

  /**
   * Download Chromium into cache directory
   * @returns {Promise<string>} Path to downloaded Chromium
   */
  async _downloadBrowser() {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
    
    const revision = '1234567'; // Latest known good revision
    const platformMap = {
      darwin: 'mac',
      linux: 'linux',
      win32: 'win'
    };
    const archMap = {
      x64: 'x64',
      arm64: 'arm64'
    };
    
    const platformName = platformMap[this.platform] || this.platform;
    const archName = archMap[this.arch] || this.arch;
    
    const downloadUrl = `https://storage.googleapis.com/chromium-browser-snapshots/${platformName}/${revision}/${platformName}-${revision}-${archName}.zip`;
    const extractPath = path.join(this.cacheDir, `chromium-${platformName}-${archName}-${revision}`);
    const executableName = this.platform === 'win32' ? 'chrome.exe' : 'chrome';
    const executablePath = path.join(extractPath, executableName);
    
    // Check if already downloaded
    if (await this._exists(executablePath)) {
      return executablePath;
    }
    
    console.log(`Downloading Chromium from ${downloadUrl}...`);
    
    // Use curl or wget to download
    const downloadPath = path.join(this.cacheDir, 'chromium.zip');
    
    try {
      // Try curl first
      spawnSync('curl', ['-L', '-o', downloadPath, downloadUrl], {
        stdio: 'inherit',
        timeout: 120000
      });
    } catch {
      // Try wget
      spawnSync('wget', ['-O', downloadPath, downloadUrl], {
        stdio: 'inherit',
        timeout: 120000
      });
    }
    
    // Extract
    console.log('Extracting Chromium...');
    
    if (this.platform === 'win32') {
      // Use built-in zip on Windows
      spawnSync('tar', ['-xf', downloadPath, '-C', this.cacheDir], {
        stdio: 'inherit'
      });
    } else {
      // Use unzip on Unix
      spawnSync('unzip', ['-q', downloadPath, '-d', this.cacheDir], {
        stdio: 'inherit'
      });
    }
    
    // Cleanup
    try {
      await fs.promises.unlink(downloadPath);
    } catch {
      // Ignore cleanup errors
    }
    
    if (await this._exists(executablePath)) {
      // Make executable on Unix
      if (this.platform !== 'win32') {
        await fs.promises.chmod(executablePath, 0o755);
      }
      return executablePath;
    }
    
    throw new Error(`Failed to download and extract Chromium to ${executablePath}`);
  }

  /**
   * Create a CDP client with resolved browser
   * @param {Object} options - Options passed to CDPClient
   * @returns {Promise<CDPClient>}
   */
  async createClient(options = {}) {
    const executablePath = await this.resolve();
    const client = new CDPClient();
    await client.launch({ 
      executablePath,
      ...options 
    });
    return client;
  }
}

module.exports = { BrowserResolver };
