/**
 * Browser Resolver - Finds or provisions Chromium for CDP
 * 
 * Priority order:
 * 1. System Chromium/Chrome (CHROME_PATH env or common locations)
 * 2. npm-installed Chromium (via @puppeteer/browsers if available)
 * 3. Download and cache Chromium in .cache/
 * 
 * In environments without a real browser (CI, testing), provides clear error messages.
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
    // Playwright-provisioned Chromium, common in CI images and dev containers.
    // Checked first because when it exists it is the build the environment
    // actually intends the tooling to use.
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH
      ? [`${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium`]
      : []),
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
    '/opt/google/chrome/google-chrome',
    '/usr/local/bin/chromium',
    '/usr/local/bin/chrome',
    '/usr/lib/chromium-browser/chromium',
    '/usr/lib64/chromium-browser/chromium'
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    'C:\\Users\\Public\\AppData\\Local\\Chromium\\Application\\chrome.exe'
  ]
};

// Known good Chromium revision - using a stable revision that exists
// Revision 1142811 is a known good revision for Linux x64
const KNOWN_GOOD_REVISION = '1142811';

/**
 * BrowserResolver - Manages browser discovery and provisioning
 */
class BrowserResolver {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'chromium');
    this.platform = os.platform();
    this.arch = os.arch();
    this.customPath = process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
    this._downloadedPath = null;
  }

  /**
   * Resolve browser executable path
   * @returns {Promise<string>} Path to Chromium executable
   */
  async resolve() {
    // 1. Check custom path
    if (this.customPath && await this._exists(this.customPath)) {
      console.log(`Found browser at custom path: ${this.customPath}`);
      return this.customPath;
    }

    // 2. Check system browsers
    const systemPath = await this._findSystemBrowser();
    if (systemPath) {
      console.log(`Found system browser: ${systemPath}`);
      return systemPath;
    }

    // 3. Try npm-installed browsers
    const npmPath = await this._findNpmBrowser();
    if (npmPath) {
      console.log(`Found npm-installed browser: ${npmPath}`);
      return npmPath;
    }

    // 4. Try to download and cache
    try {
      const downloadedPath = await this._downloadBrowser();
      console.log(`Downloaded browser to: ${downloadedPath}`);
      return downloadedPath;
    } catch (error) {
      console.error(`Failed to download Chromium: ${error.message}`);
      console.error('');
      console.error('To resolve this:');
      console.error('  1. Install Chromium on your system');
      console.error('  2. Or set CHROME_PATH environment variable to a Chromium executable');
      console.error('  3. Or run with DESIGN_AUDIT_SKIP_BROWSER=true to skip browser tests');
      throw error;
    }
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
    const browsersToCheck = ['chromium-browser', 'chromium', 'google-chrome', 'chrome', 'google-chrome-stable'];
    
    for (const browser of browsersToCheck) {
      try {
        const whichResult = spawnSync('which', [browser], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        });
        
        if (whichResult.stdout && !whichResult.error) {
          const foundPath = whichResult.stdout.trim();
          if (await this._exists(foundPath)) {
            return foundPath;
          }
        }
      } catch {
        // which command not available
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
   * Get the platform-specific download URL and executable path
   * @returns {Object} Download configuration
   */
  _getDownloadConfig() {
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
    
    // Use a known good revision
    const revision = KNOWN_GOOD_REVISION;
    
    // Build download URL
    const downloadUrl = `https://storage.googleapis.com/chromium-browser-snapshots/${platformName}/${revision}/${platformName}-${revision}-${archName}.zip`;
    
    // Build extract path and executable path
    const extractPath = path.join(this.cacheDir, `chromium-${platformName}-${archName}-${revision}`);
    const executableName = this.platform === 'win32' ? 'chrome.exe' : 'chrome';
    const executablePath = path.join(extractPath, executableName);
    
    return { downloadUrl, extractPath, executablePath, revision };
  }

  /**
   * Download Chromium into cache directory
   * @returns {Promise<string>} Path to downloaded Chromium
   */
  async _downloadBrowser() {
    await fs.promises.mkdir(this.cacheDir, { recursive: true });
    
    const { downloadUrl, extractPath, executablePath, revision } = this._getDownloadConfig();
    
    // Check if already downloaded
    if (await this._exists(executablePath)) {
      return executablePath;
    }
    
    console.log(`Downloading Chromium revision ${revision} from ${downloadUrl}...`);
    
    // Use curl or wget to download
    const downloadPath = path.join(this.cacheDir, `chromium-${revision}.zip`);
    
    // Try curl first
    let downloadSuccess = false;
    try {
      const curlResult = spawnSync('curl', ['-L', '-o', downloadPath, '--fail', '--silent', '--retry', '3', downloadUrl], {
        stdio: 'inherit',
        timeout: 300000 // 5 minutes
      });
      if (curlResult.status === 0) {
        downloadSuccess = true;
      }
    } catch (e) {
      console.log('curl failed, trying wget...');
    }
    
    // Try wget if curl failed
    if (!downloadSuccess) {
      try {
        const wgetResult = spawnSync('wget', ['-O', downloadPath, '-q', '--tries=3', downloadUrl], {
          stdio: 'inherit',
          timeout: 300000
        });
        if (wgetResult.status === 0) {
          downloadSuccess = true;
        }
      } catch (e) {
        console.log('wget failed');
      }
    }
    
    if (!downloadSuccess) {
      throw new Error(`Failed to download Chromium from ${downloadUrl}. Network access may be restricted.`);
    }
    
    // Verify the download is a valid zip file
    try {
      const stats = await fs.promises.stat(downloadPath);
      if (stats.size < 10000000) { // Less than 10MB is likely not a valid Chromium download
        throw new Error(`Downloaded file is too small (${stats.size} bytes). The URL may be invalid.`);
      }
    } catch (e) {
      throw new Error(`Download verification failed: ${e.message}`);
    }
    
    // Extract
    console.log('Extracting Chromium...');
    
    if (this.platform === 'win32') {
      // Use built-in zip on Windows
      const extractResult = spawnSync('tar', ['-xf', downloadPath, '-C', this.cacheDir], {
        stdio: 'inherit'
      });
      if (extractResult.status !== 0) {
        throw new Error('Failed to extract Chromium archive with tar');
      }
    } else {
      // Use unzip on Unix
      const extractResult = spawnSync('unzip', ['-q', downloadPath, '-d', this.cacheDir], {
        stdio: 'inherit'
      });
      if (extractResult.status !== 0) {
        throw new Error('Failed to extract Chromium archive with unzip');
      }
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
      this._downloadedPath = executablePath;
      return executablePath;
    }
    
    // Check if the executable is in a subdirectory (some Chromium packages have this structure)
    const possiblePaths = [
      path.join(extractPath, 'chrome-linux', 'chrome'),
      path.join(extractPath, 'chrome'),
      path.join(extractPath, 'Chrome.app', 'Contents', 'MacOS', 'Chrome'),
      path.join(extractPath, 'chromium'),
    ];
    
    for (const possiblePath of possiblePaths) {
      if (await this._exists(possiblePath)) {
        if (this.platform !== 'win32') {
          await fs.promises.chmod(possiblePath, 0o755);
        }
        this._downloadedPath = possiblePath;
        return possiblePath;
      }
    }
    
    throw new Error(`Failed to find Chromium executable in ${extractPath}. Please check the archive structure.`);
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
