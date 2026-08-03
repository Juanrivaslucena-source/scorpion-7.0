/**
 * Audit Engine - Orchestrates the design audit process
 * 
 * Manages browser provisioning, page navigation, DOM inspection,
 * and rule execution.
 */

const { CDPClient } = require('./cdp-client');
const { BrowserResolver } = require('./browser-resolver');
const { ContrastRule } = require('./rules/contrast-rule');
const { OverflowRule } = require('./rules/overflow-rule');
const { OversizedIconRule } = require('./rules/oversized-icon-rule');
const { TextCollisionRule } = require('./rules/text-collision-rule');
const {
  getComputedStyle,
  getBoundingRect,
  getScrollWidth,
  navigate,
  setViewport,
  getDOMTree,
  captureScreenshot
} = require('./dom-utils');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Default viewport configurations
 */
const DEFAULT_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 }
];

/**
 * Default routes to audit
 */
const DEFAULT_ROUTES = [
  '/',
  '/about',
  '/contact',
  '/dashboard',
  '/settings',
  '/profile'
];

/**
 * Audit Engine
 */
class AuditEngine {
  constructor(options = {}) {
    this.browserResolver = new BrowserResolver(options);
    this.client = null;
    this.rules = [];
    this.findings = [];
    this.reportDir = options.reportDir || path.join(process.cwd(), 'design-report');
    this.viewports = options.viewports || DEFAULT_VIEWPORTS;
    this.baseUrl = options.baseUrl || process.env.DESIGN_AUDIT_BASE_URL || 'http://localhost:3000';
    this.routes = options.routes || process.env.DESIGN_AUDIT_ROUTES?.split(',') || DEFAULT_ROUTES;
    this.timeout = parseInt(options.timeout || process.env.DESIGN_AUDIT_TIMEOUT || '30000');
    this.skipBrowser = process.env.DESIGN_AUDIT_SKIP_BROWSER === 'true' || options.skipBrowser;
    
    // Initialize default rules
    this._initializeRules();
  }

  /**
   * Initialize default audit rules
   */
  _initializeRules() {
    this.rules = [
      new ContrastRule(),
      new OverflowRule(),
      new OversizedIconRule(),
      new TextCollisionRule()
    ];
  }

  /**
   * Add a custom rule
   * @param {Object} rule - Audit rule instance
   */
  addRule(rule) {
    this.rules.push(rule);
  }

  /**
   * Initialize the audit
   * @returns {Promise<void>}
   */
  async initialize() {
    // Create report directory
    await fs.promises.mkdir(this.reportDir, { recursive: true });
    
    // Skip browser initialization if requested (for testing)
    if (this.skipBrowser) {
      console.log('Skipping browser initialization (DESIGN_AUDIT_SKIP_BROWSER=true)');
      return;
    }
    
    // Resolve browser
    const executablePath = await this.browserResolver.resolve();
    console.log(`Using browser: ${executablePath}`);
    
    // Create CDP client
    this.client = new CDPClient();
    await this.client.launch({ executablePath });
    
    // Enable necessary domains
    await this.client.send('DOM.enable');
    await this.client.send('CSS.enable');
    await this.client.send('Page.enable');
  }

  /**
   * Run the full audit
   * @returns {Promise<Object>} Audit results
   */
  async run() {
    if (!this.client && !this.skipBrowser) {
      await this.initialize();
    }

    const results = {
      timestamp: new Date().toISOString(),
      viewports: [],
      totalFindings: 0,
      findingsByRule: {},
      findingsBySeverity: {},
      skipped: this.skipBrowser
    };

    // If skipping browser, return empty results (for testing)
    if (this.skipBrowser) {
      await this._generateReport(results);
      return results;
    }

    // Audit each viewport
    for (const viewport of this.viewports) {
      const viewportResults = {
        name: viewport.name,
        width: viewport.width,
        height: viewport.height,
        routes: [],
        findings: []
      };

      // Set viewport
      await setViewport(this.client, viewport.width, viewport.height);

      // Audit each route
      for (const route of this.routes) {
        const url = new URL(route, this.baseUrl).toString();
        
        console.log(`Auditing ${url} at ${viewport.width}x${viewport.height}...`);
        
        try {
          // Navigate to page
          await navigate(this.client, url, this.timeout);
          
          // Wait a bit for dynamic content
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Get DOM tree
          const domTree = await getDOMTree(this.client);
          
          if (!domTree) {
            console.warn(`Failed to get DOM tree for ${url}`);
            continue;
          }
          
          // Capture screenshot
          const screenshotDir = path.join(this.reportDir, viewport.name, route.replace(/[^a-z0-9]/gi, '_'));
          await fs.promises.mkdir(screenshotDir, { recursive: true });
          const screenshotPath = path.join(screenshotDir, 'screenshot.png');
          await captureScreenshot(this.client, screenshotPath);

          // Create audit context
          const context = {
            client: this.client,
            viewportWidth: viewport.width,
            viewportHeight: viewport.height,
            url,
            getBoundingRect: (node) => getBoundingRect(this.client, node),
            getScrollWidth: (node) => getScrollWidth(this.client, node),
            getComputedStyle: (node) => getComputedStyle(this.client, node)
          };

          // Run all rules
          const routeFindings = [];
          
          for (const rule of this.rules) {
            try {
              const findings = await rule.audit(domTree, context.getComputedStyle, context);
              
              for (const finding of findings) {
                finding.rule = rule.id;
                finding.severity = rule.severity;
                finding.viewport = viewport.name;
                finding.route = route;
                finding.timestamp = new Date().toISOString();
                
                routeFindings.push(finding);
                viewportResults.findings.push(finding);
                
                // Update aggregated results
                results.totalFindings++;
                results.findingsByRule[rule.id] = (results.findingsByRule[rule.id] || 0) + 1;
                results.findingsBySeverity[finding.severity] = (results.findingsBySeverity[finding.severity] || 0) + 1;
              }
            } catch (error) {
              console.error(`Rule ${rule.id} failed for ${url}:`, error.message);
            }
          }

          viewportResults.routes.push({
            url,
            findings: routeFindings
          });

          console.log(`  Found ${routeFindings.length} findings for ${url}`);
          
        } catch (error) {
          console.error(`Failed to audit ${url}:`, error.message);
          viewportResults.routes.push({
            url,
            error: error.message,
            findings: []
          });
        }
      }

      results.viewports.push(viewportResults);
    }

    // Generate report
    await this._generateReport(results);

    return results;
  }

  /**
   * Generate audit report
   * @param {Object} results - Audit results
   */
  async _generateReport(results) {
    // Write JSON report
    const jsonPath = path.join(this.reportDir, 'audit-results.json');
    await fs.promises.writeFile(
      jsonPath,
      JSON.stringify(results, null, 2)
    );

    // Write markdown summary
    const mdPath = path.join(this.reportDir, 'audit-report.md');
    const mdContent = this._generateMarkdownReport(results);
    await fs.promises.writeFile(mdPath, mdContent);

    // Write FIXME.md for Claude Code
    const fixmePath = path.join(this.reportDir, 'FIXME.md');
    const fixmeContent = this._generateFixmeReport(results);
    await fs.promises.writeFile(fixmePath, fixmeContent);

    console.log(`Report generated: ${this.reportDir}`);
  }

  /**
   * Generate markdown report
   * @param {Object} results - Audit results
   * @returns {string} Markdown content
   */
  _generateMarkdownReport(results) {
    const lines = [
      `# Design Audit Report`,
      ``,
      `**Timestamp:** ${results.timestamp}`,
      `**Total Findings:** ${results.totalFindings}`,
      ``
    ];

    if (results.skipped) {
      lines.push(`**Note:** Browser audit skipped (DESIGN_AUDIT_SKIP_BROWSER=true)\n`);
    }

    // Summary by severity
    lines.push(
      `## Summary by Severity`,
      ``
    );

    const severityOrder = { error: 1, warning: 2, info: 3 };
    const sortedSeverities = Object.keys(results.findingsBySeverity || {})
      .sort((a, b) => (severityOrder[a] || 999) - (severityOrder[b] || 999));
    
    for (const severity of sortedSeverities) {
      const count = results.findingsBySeverity[severity];
      lines.push(`- **${severity}:** ${count}`);
    }

    lines.push(
      ``,
      `## Summary by Rule`,
      ``
    );

    // Summary by rule
    for (const [ruleId, count] of Object.entries(results.findingsByRule || {})) {
      lines.push(`- **${ruleId}:** ${count}`);
    }

    // Details by viewport
    for (const viewport of results.viewports || []) {
      lines.push(
        ``,
        `## ${viewport.name} (${viewport.width}x${viewport.height})`,
        ``
      );

      for (const route of viewport.routes || []) {
        lines.push(
          `### ${route.url}`,
          ``,
          `**Findings:** ${route.findings?.length || 0}`,
          ``
        );

        for (const finding of route.findings || []) {
          lines.push(
            `- **${finding.rule}** (${finding.severity}): ${finding.message}`,
            `  - Element: ${finding.element}`,
            `  - Expected: ${finding.expected}`,
            `  - Actual: ${finding.actual}`
          );
        }

        if (route.error) {
          lines.push(`- **Error:** ${route.error}`);
        }

        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate FIXME.md for Claude Code
   * @param {Object} results - Audit results
   * @returns {string} FIXME.md content
   */
  _generateFixmeReport(results) {
    const lines = [
      `# Design Audit Findings - Action Required`,
      ``,
      `Generated: ${results.timestamp}`,
      `Total Issues: ${results.totalFindings}`,
      ``
    ];

    if (results.skipped) {
      lines.push(`**Note:** Browser audit was skipped. This report contains no findings.\n`);
    }

    if (results.totalFindings === 0 && !results.skipped) {
      lines.push(`✅ No design issues found!\n`);
    } else if (results.totalFindings > 0) {
      lines.push(`## Tasks for Claude Code\n`);

      // Group findings by rule and severity
      const groupedFindings = {};
      
      for (const viewport of results.viewports || []) {
        for (const route of viewport.routes || []) {
          for (const finding of route.findings || []) {
            const key = `${finding.rule}:${finding.severity}`;
            if (!groupedFindings[key]) {
              groupedFindings[key] = [];
            }
            groupedFindings[key].push(finding);
          }
        }
      }

      // Sort by severity (error first, then warning)
      const severityOrder = { error: 1, warning: 2, info: 3 };
      const sortedKeys = Object.keys(groupedFindings).sort((a, b) => {
        const aSeverity = a.split(':')[1];
        const bSeverity = b.split(':')[1];
        return (severityOrder[aSeverity] || 999) - (severityOrder[bSeverity] || 999);
      });

      for (const key of sortedKeys) {
        const [ruleId, severity] = key.split(':');
        const findings = groupedFindings[key];
        
        // Group by CSS variable or common pattern
        const patternGroups = this._groupFindingsByPattern(findings);
        
        for (const group of patternGroups) {
          lines.push(
            `## ${ruleId.toUpperCase().replace(/-/g, ' ')} (${severity})`,
            ``,
            `**Pattern:** ${group.pattern || 'Multiple elements'}`,
            `**Count:** ${group.findings.length} occurrences`,
            ``,
            `### Example Findings:`
          );

          // Show first 3 findings as examples
          for (const finding of group.findings.slice(0, 3)) {
            lines.push(
              `- ${finding.message}`,
              `  - Selector: ${finding.element}`,
              `  - Viewport: ${finding.viewport} (${finding.route})`
            );
          }

          if (group.findings.length > 3) {
            lines.push(`- ... and ${group.findings.length - 3} more`);
          }

          lines.push(
            ``,
            `### Suggested Fix`,
            ``
          );

          // Generate suggested fix based on rule
          const fix = this._generateSuggestedFix(ruleId, group);
          lines.push(fix);
          lines.push('');
        }
      }
    }

    lines.push(
      `---`,
      ``,
      `## Notes`,
      `- This file is generated by the design audit system`,
      `- Fix the UI, never weaken a rule to make a finding disappear`,
      `- Re-run audit with: npm run design:audit`
    );

    return lines.join('\n');
  }

  /**
   * Group findings by common pattern
   * @param {Array} findings - Array of findings
   * @returns {Array} Grouped findings
   */
  _groupFindingsByPattern(findings) {
    const groups = [];
    const used = new Set();

    // Try to group by CSS color variable
    const colorGroups = new Map();
    
    for (let i = 0; i < findings.length; i++) {
      if (used.has(i)) continue;
      
      const finding = findings[i];
      
      // Check if this is a contrast finding with a color
      if (finding.rule === 'contrast' && finding.color) {
        const key = finding.color || finding.bgColor;
        if (!colorGroups.has(key)) {
          colorGroups.set(key, []);
        }
        colorGroups.get(key).push(finding);
        used.add(i);
      }
    }

    // Add color groups
    for (const [key, groupFindings] of colorGroups) {
      groups.push({
        pattern: `Color: ${key}`,
        findings: groupFindings
      });
    }

    // Add remaining findings as individual groups
    for (let i = 0; i < findings.length; i++) {
      if (!used.has(i)) {
        groups.push({
          pattern: findings[i].element || 'Unknown',
          findings: [findings[i]]
        });
      }
    }

    return groups;
  }

  /**
   * Generate suggested fix based on rule
   * @param {string} ruleId - Rule identifier
   * @param {Object} group - Finding group
   * @returns {string} Suggested fix
   */
  _generateSuggestedFix(ruleId, group) {
    const fixes = {
      contrast: () => {
        if (group.pattern && group.pattern.startsWith('Color:')) {
          const color = group.pattern.replace('Color:', '').trim();
          return `Update CSS variable or color value to meet WCAG AA contrast (4.5:1 for normal text, 3:1 for large text). Current color: ${color}`;
        }
        return 'Adjust text or background colors to meet WCAG AA contrast requirements.';
      },
      'horizontal-overflow': () => {
        return 'Reduce element width, add overflow handling (overflow-x: auto), or adjust layout to prevent horizontal overflow.';
      },
      'oversized-icon': () => {
        return 'Reduce icon size to be within 2.5x the parent font size, or adjust parent font size.';
      },
      'text-collision': () => {
        return 'Adjust margins, padding, or positioning to prevent text overlap.';
      }
    };

    return fixes[ruleId]?.() || 'Review the element and adjust styling as needed.';
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}

module.exports = { AuditEngine };
