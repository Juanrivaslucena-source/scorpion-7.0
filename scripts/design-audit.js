#!/usr/bin/env node
/**
 * scripts/design-audit.js
 * Automated visual/design QA — the manual screenshot review, as a script.
 *
 * Boots the dev server, drives a real Chromium over CDP, walks every view at
 * desktop and mobile widths, captures screenshots, and runs the design rules
 * against the live DOM. Collects console errors and failed requests too.
 *
 * Emits three artifacts under design-report/:
 *   report.json   machine-readable findings
 *   REPORT.md     human-readable summary
 *   FIXME.md      a prioritized brief written for Claude Code
 *
 * Usage:
 *   node scripts/design-audit.js
 *   node scripts/design-audit.js --views dashboard,sales
 *   node scripts/design-audit.js --no-download      # fail instead of fetching Chromium
 *   node scripts/design-audit.js --fail-on warning  # stricter exit code
 *   node scripts/design-audit.js --open             # print the report path
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const { launch, sleep } = require('./lib/cdp');
const { resolveBrowser } = require('./lib/browser-provision');
const { AUDIT_SOURCE } = require('./lib/design-rules');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'design-report');
const SHOT_DIR = path.join(OUT_DIR, 'screens');

/* ---------- config -------------------------------------------------------- */

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1000, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

const VIEWS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'scout', label: 'Product Scout' },
  { id: 'studio', label: 'Content Studio' },
  { id: 'sales', label: 'Sales Tracker' },
  { id: 'models', label: 'Model Registry' },
  { id: 'settings', label: 'Settings' },
];

const C = {
  dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', reset: '\x1b[0m',
};
const log = (msg, color = 'reset') => console.log(`${C[color]}${msg}${C.reset}`);

/* ---------- cli ----------------------------------------------------------- */

function parseArgs(argv) {
  const args = {
    port: 4179, views: null, allowDownload: true,
    failOn: 'error', keepServer: false, open: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--views') args.views = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--no-download') args.allowDownload = false;
    else if (a === '--fail-on') args.failOn = argv[++i];
    else if (a === '--open') args.open = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
Scorpion design audit

  node scripts/design-audit.js [options]

  --views a,b        Audit only these views (default: all six)
  --port N           Dev server port (default 4179)
  --no-download      Fail rather than provisioning Chromium
  --fail-on LEVEL    error | warning | never   (default error)
  --open             Print the report path when finished

Outputs design-report/{report.json,REPORT.md,FIXME.md,screens/}.
FIXME.md is written as a work order for Claude Code.
`);
}

/* ---------- dev server ---------------------------------------------------- */

function startServer(port) {
  const proc = spawn(process.execPath, [path.join(ROOT, 'scripts', 'dev-server.js'), '--port', String(port)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  return proc;
}

async function waitForServer(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return true;
    } catch { /* not up yet */ }
    await sleep(120);
  }
  throw new Error(`Dev server did not start on port ${port}`);
}

/* ---------- audit --------------------------------------------------------- */

async function auditView(session, { view, viewport, baseUrl }) {
  const consoleErrors = [];
  const failedRequests = [];

  session.on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error') return;
    const text = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
    if (text) consoleErrors.push(text.slice(0, 300));
  });
  session.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    consoleErrors.push(`Uncaught: ${d?.exception?.description || d?.text || 'unknown'}`.slice(0, 300));
  });
  session.on('Network.loadingFailed', (p) => {
    failedRequests.push(`${p.type}: ${p.errorText}`);
  });

  await session.setViewport({
    width: viewport.width, height: viewport.height,
    deviceScaleFactor: 1, mobile: viewport.mobile,
  });

  // Seed a demo session first so the app boots straight past the login gate,
  // then reload so app.js reads it during its normal start sequence.
  await session.navigate(`${baseUrl}/#${view.id}`, { waitUntil: 'load' });
  await session.evaluate(`(() => {
    localStorage.setItem('scorpion.session', JSON.stringify({
      mode: 'demo', token: null,
      user: { login: 'audit', name: 'Design Audit', avatar_url: null, role: 'QA' },
      createdAt: Date.now(), expiresAt: Date.now() + 3600000
    }));
    return true;
  })()`);
  await session.reload();

  // Wait for the view to actually paint (data fetch + render complete).
  const deadline = Date.now() + 8000;
  let ready = false;
  while (Date.now() < deadline) {
    ready = await session.evaluate(`(() => {
      const v = document.querySelector('#view-${view.id}');
      const app = document.querySelector('#app');
      return !!(app && app.classList.contains('ready') && v && v.textContent.trim().length > 40
                && !v.querySelector('.skeleton'));
    })()`);
    if (ready) break;
    await sleep(100);
  }
  if (!ready) {
    throw new Error(`view "${view.id}" never finished rendering (8s timeout)`);
  }
  await sleep(250); // let CSS transitions settle

  const result = await session.evaluate(AUDIT_SOURCE);

  const shotName = `${view.id}-${viewport.name}.png`;
  const png = await session.screenshot({ fullPage: viewport.name === 'desktop' });
  fs.writeFileSync(path.join(SHOT_DIR, shotName), png);

  return {
    view: view.id,
    viewLabel: view.label,
    viewport: viewport.name,
    width: viewport.width,
    screenshot: path.join('screens', shotName),
    findings: result.findings || [],
    stats: result.stats || {},
    consoleErrors,
    failedRequests,
  };
}

/* ---------- reporting ----------------------------------------------------- */

const RULE_GUIDANCE = {
  'oversized-icon': {
    title: 'Icons rendering at the wrong size',
    fix: 'Give inline SVG an explicit size. A global `svg:not([width]) { width:16px; height:16px }` plus per-component overrides prevents icons filling their container.',
    files: ['assets/css/dashboard.css'],
  },
  'horizontal-overflow': {
    title: 'Content clipped by horizontal overflow',
    fix: 'A fixed `min-width` inside a narrow container forces overflow. Add a compact table variant or let the container scroll.',
    files: ['assets/css/dashboard.css', 'assets/js/dashboard.js'],
  },
  'page-horizontal-scroll': {
    title: 'Page scrolls horizontally',
    fix: 'Something exceeds the viewport. Check `min-width` on tables/cards and any fixed pixel widths at mobile breakpoints.',
    files: ['assets/css/dashboard.css'],
  },
  'text-collision': {
    title: 'Overlapping text',
    fix: 'Two sibling text elements occupy the same box — usually a margin overridden by a later rule. Add explicit spacing or a separating border.',
    files: ['assets/css/dashboard.css'],
  },
  'low-contrast': {
    title: 'Text fails WCAG AA contrast',
    fix: 'Lighten the foreground or darken the backdrop until body text reaches 4.5:1 (3:1 for large text).',
    files: ['assets/css/dashboard.css'],
  },
  'small-touch-target': {
    title: 'Touch target below 24px',
    fix: 'Increase padding or min-height/min-width so the hit area is at least 24x24px.',
    files: ['assets/css/dashboard.css'],
  },
  'missing-accessible-name': {
    title: 'Control has no accessible name',
    fix: 'Add visible text or an `aria-label`. Icon-only buttons always need one.',
    files: ['index.html', 'assets/js/dashboard.js'],
  },
  'missing-alt': {
    title: 'Image missing alt attribute',
    fix: 'Add `alt=""` for decorative images or a short description otherwise.',
    files: ['index.html', 'assets/js/app.js'],
  },
  'template-artifact': {
    title: 'Unresolved value in rendered output',
    fix: '`undefined`, `NaN` or `[object Object]` reached the DOM. Guard the missing field or fix the format helper.',
    files: ['assets/js/dashboard.js', 'assets/js/api.js'],
  },
  'empty-view': {
    title: 'View rendered blank',
    fix: 'The render path produced no content — check the data load and the view render function.',
    files: ['assets/js/app.js', 'assets/js/dashboard.js'],
  },
  'console-error': {
    title: 'JavaScript error in the console',
    fix: 'Fix the underlying exception; console errors usually mean a broken render path.',
    files: ['assets/js/app.js'],
  },
};

function buildReport(results, meta) {
  const findings = [];
  for (const r of results) {
    for (const f of r.findings) {
      findings.push({ ...f, view: r.view, viewport: r.viewport, screenshot: r.screenshot });
    }
    for (const e of r.consoleErrors) {
      findings.push({
        rule: 'console-error', severity: 'error', selector: 'window',
        detail: e, view: r.view, viewport: r.viewport, screenshot: r.screenshot,
      });
    }
  }

  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  const byRule = {};
  for (const f of findings) {
    (byRule[f.rule] ||= []).push(f);
  }

  // Collapse findings that share a groupKey (e.g. one failing colour pair
  // repeated across many nodes) so the brief lists fixes, not symptoms.
  const groups = {};
  for (const [rule, items] of Object.entries(byRule)) {
    const buckets = new Map();
    for (const f of items) {
      const key = f.groupKey || `${f.view}/${f.viewport}/${f.selector}`;
      if (!buckets.has(key)) buckets.set(key, { ...f, occurrences: 0, examples: [] });
      const b = buckets.get(key);
      b.occurrences += 1;
      if (b.examples.length < 6) {
        b.examples.push(`${f.view}/${f.viewport} ${f.selector}${f.sample ? ` — "${f.sample}"` : ''}`);
      }
    }
    groups[rule] = [...buckets.values()];
  }

  return {
    generatedAt: new Date().toISOString(),
    meta,
    summary: {
      views: results.length,
      findings: findings.length,
      errors: errors.length,
      warnings: warnings.length,
      rulesTriggered: Object.keys(byRule).length,
      status: errors.length ? 'fail' : warnings.length ? 'warn' : 'pass',
    },
    byRule,
    groups,
    findings,
    results: results.map((r) => ({
      view: r.view, viewport: r.viewport, screenshot: r.screenshot,
      findings: r.findings.length, consoleErrors: r.consoleErrors.length,
      stats: r.stats,
    })),
  };
}

function writeMarkdown(report) {
  const s = report.summary;
  const icon = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' }[s.status];
  const lines = [];

  lines.push('# Design Audit Report');
  lines.push('');
  lines.push(`**${icon}** — ${s.errors} error(s), ${s.warnings} warning(s) across ${s.views} view/viewport combinations.`);
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Browser: ${report.meta.browser}`);
  lines.push('');

  if (!report.findings.length) {
    lines.push('No issues detected. Every rule passed on every view.');
    lines.push('');
  } else {
    lines.push('## Findings by rule');
    lines.push('');
    for (const [rule, buckets] of Object.entries(report.groups)) {
      const guidance = RULE_GUIDANCE[rule] || {};
      const total = buckets.reduce((n, b) => n + b.occurrences, 0);
      const sev = buckets.some((i) => i.severity === 'error') ? 'error' : 'warning';
      lines.push(`### \`${rule}\` — ${buckets.length} distinct issue(s), ${total} occurrence(s) [${sev}]`);
      lines.push('');
      if (guidance.title) lines.push(`_${guidance.title}_`);
      lines.push('');
      for (const item of buckets.slice(0, 10)) {
        const times = item.occurrences > 1 ? ` _(x${item.occurrences})_` : '';
        lines.push(`- ${item.detail}${times}`);
        for (const ex of item.examples.slice(0, 3)) lines.push(`  - \`${ex}\``);
      }
      if (buckets.length > 10) lines.push(`- _...and ${buckets.length - 10} more_`);
      lines.push('');
      if (guidance.fix) {
        lines.push(`**Fix:** ${guidance.fix}`);
        lines.push('');
      }
    }
  }

  lines.push('## Screens captured');
  lines.push('');
  lines.push('| View | Viewport | Findings | Console errors | Screenshot |');
  lines.push('|---|---|---|---|---|');
  for (const r of report.results) {
    lines.push(`| ${r.view} | ${r.viewport} | ${r.findings} | ${r.consoleErrors} | [\`${r.screenshot}\`](${r.screenshot}) |`);
  }
  lines.push('');

  return lines.join('\n');
}

/** The handoff document: a work order aimed at Claude Code. */
function writeFixme(report) {
  const s = report.summary;
  const lines = [];

  lines.push('# Design Audit — Fix Brief');
  lines.push('');
  lines.push('> Generated by `npm run design:audit`. This file is the work order for the');
  lines.push('> next coding session. Delete it once every task is checked off.');
  lines.push('');
  lines.push(`**Status:** ${s.status.toUpperCase()} — ${s.errors} error(s), ${s.warnings} warning(s)`);
  lines.push(`**Audited:** ${s.views} view/viewport combinations at ${report.generatedAt}`);
  lines.push('');

  if (!report.findings.length) {
    lines.push('## Nothing to fix');
    lines.push('');
    lines.push('Every rule passed. No action needed.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Context');
  lines.push('');
  lines.push('These issues were found by rendering the app in a real browser and');
  lines.push('inspecting the live DOM — they are things static checks and unit tests');
  lines.push('cannot see. Each finding lists the exact selector, view, and viewport.');
  lines.push('');
  lines.push('## Tasks');
  lines.push('');

  const order = ['error', 'warning'];
  let n = 0;
  for (const severity of order) {
    const rules = Object.entries(report.groups)
      .filter(([, items]) => items.some((i) => i.severity === severity));

    for (const [rule, items] of rules) {
      const relevant = items.filter((i) => i.severity === severity);
      if (!relevant.length) continue;
      const g = RULE_GUIDANCE[rule] || {};
      n += 1;

      lines.push(`### ${n}. ${g.title || rule} \`[${severity}]\``);
      lines.push('');
      const totalOcc = relevant.reduce((n, b) => n + b.occurrences, 0);
      lines.push(`**Rule:** \`${rule}\` · **Distinct issues:** ${relevant.length} · **Occurrences:** ${totalOcc}`);
      lines.push('');
      if (g.files?.length) {
        lines.push(`**Likely files:** ${g.files.map((f) => `\`${f}\``).join(', ')}`);
        lines.push('');
      }
      lines.push('**Where:**');
      lines.push('');
      lines.push('```');
      for (const item of relevant.slice(0, 10)) {
        lines.push(`${item.detail}${item.occurrences > 1 ? '  (x' + item.occurrences + ')' : ''}`);
        for (const ex of item.examples) lines.push(`    ${ex}`);
      }
      if (relevant.length > 10) lines.push(`... and ${relevant.length - 10} more`);
      lines.push('```');
      lines.push('');
      if (g.fix) {
        lines.push(`**Suggested fix:** ${g.fix}`);
        lines.push('');
      }
      lines.push('- [ ] Fixed and re-audited');
      lines.push('');
    }
  }

  lines.push('## Verification');
  lines.push('');
  lines.push('After making changes, confirm both suites are green:');
  lines.push('');
  lines.push('```bash');
  lines.push('npm test              # 74 unit/integration tests');
  lines.push('npm run design:audit  # this audit — must report PASS');
  lines.push('```');
  lines.push('');
  lines.push('Do not edit `design-report/` by hand; it is regenerated on every run.');
  lines.push('');

  return lines.join('\n');
}

/* ---------- main ---------------------------------------------------------- */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const views = args.views
    ? VIEWS.filter((v) => args.views.includes(v.id))
    : VIEWS;
  if (!views.length) throw new Error(`No matching views. Known: ${VIEWS.map((v) => v.id).join(', ')}`);

  fs.mkdirSync(SHOT_DIR, { recursive: true });

  log('\nScorpion design audit', 'bold');

  const browserInfo = resolveBrowser({
    allowDownload: args.allowDownload,
    log: (m) => log(m, 'dim'),
  });
  log(`  browser: ${browserInfo.executablePath} (${browserInfo.source})`, 'dim');

  const server = startServer(args.port);
  let browser;
  try {
    await waitForServer(args.port);
    const baseUrl = `http://127.0.0.1:${args.port}`;
    log(`  server:  ${baseUrl}`, 'dim');
    log('');

    browser = await launch({
      executablePath: browserInfo.executablePath,
      libraryPath: browserInfo.libraryPath,
    });

    const results = [];
    for (const viewport of VIEWPORTS) {
      for (const view of views) {
        const session = await browser.newPage();
        try {
          const result = await auditView(session, { view, viewport, baseUrl });
          results.push(result);

          const errs = result.findings.filter((f) => f.severity === 'error').length
            + result.consoleErrors.length;
          const warns = result.findings.filter((f) => f.severity === 'warning').length;
          const label = `${view.id}/${viewport.name}`.padEnd(24);
          if (errs) log(`  ✕ ${label} ${errs} error(s), ${warns} warning(s)`, 'red');
          else if (warns) log(`  ! ${label} ${warns} warning(s)`, 'yellow');
          else log(`  ✓ ${label} clean`, 'green');
        } finally {
          await session.send('Page.close').catch(() => {});
        }
      }
    }

    const report = buildReport(results, {
      browser: browserInfo.executablePath,
      browserSource: browserInfo.source,
      baseUrl,
    });

    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(OUT_DIR, 'REPORT.md'), writeMarkdown(report));
    fs.writeFileSync(path.join(OUT_DIR, 'FIXME.md'), writeFixme(report));

    const s = report.summary;
    log('');
    log(`  ${s.errors} error(s), ${s.warnings} warning(s) across ${s.views} view/viewport pairs`,
        s.errors ? 'red' : s.warnings ? 'yellow' : 'green');
    log(`  report:  design-report/REPORT.md`, 'dim');
    log(`  brief:   design-report/FIXME.md`, 'dim');
    log(`  screens: design-report/screens/ (${results.length} images)`, 'dim');

    if (s.status === 'pass') {
      log('\n  PASS — no design defects detected.\n', 'green');
    } else {
      log(`\n  ${s.status.toUpperCase()} — hand design-report/FIXME.md to Claude Code:`, s.errors ? 'red' : 'yellow');
      log('    claude "read design-report/FIXME.md and fix every task in it"\n', 'cyan');
    }

    if (args.open) console.log(path.join(OUT_DIR, 'REPORT.md'));

    const shouldFail =
      (args.failOn === 'error' && s.errors > 0) ||
      (args.failOn === 'warning' && (s.errors > 0 || s.warnings > 0));
    process.exitCode = shouldFail ? 1 : 0;
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
    await sleep(150);
    if (!server.killed) server.kill('SIGKILL');
  }
}

if (require.main === module) {
  main().catch((err) => {
    log(`\n  Audit failed: ${err.message}\n`, 'red');
    process.exit(2);
  });
}

module.exports = { buildReport, writeMarkdown, writeFixme, RULE_GUIDANCE, VIEWS, VIEWPORTS };
