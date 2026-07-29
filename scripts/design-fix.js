#!/usr/bin/env node
/**
 * scripts/design-fix.js
 * The handoff: run the design audit, then hand the brief to Claude Code.
 *
 * This is the "plug into Claude Code" step. It runs the audit, and if there
 * are findings it invokes the `claude` CLI with a prompt pointing at
 * design-report/FIXME.md, then re-audits to confirm the fixes landed.
 *
 * Usage:
 *   node scripts/design-fix.js              # audit → claude → re-audit
 *   node scripts/design-fix.js --dry-run    # audit, print the prompt, stop
 *   node scripts/design-fix.js --max-rounds 3
 *   node scripts/design-fix.js --yes        # skip the confirmation prompt
 *
 * Requires the Claude Code CLI on PATH (`claude`). Install:
 *   npm install -g @anthropic-ai/claude-code
 */

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const REPORT_JSON = path.join(ROOT, 'design-report', 'report.json');
const FIXME = path.join(ROOT, 'design-report', 'FIXME.md');

const C = {
  dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', cyan: '\x1b[36m', bold: '\x1b[1m', reset: '\x1b[0m',
};
const log = (m, c = 'reset') => console.log(`${C[c]}${m}${C.reset}`);

function parseArgs(argv) {
  const args = { dryRun: false, maxRounds: 2, yes: false, failOn: 'error' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--max-rounds') args.maxRounds = Number(argv[++i]) || 1;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--fail-on') args.failOn = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
Scorpion design fix loop

  node scripts/design-fix.js [options]

  --dry-run          Audit and print the prompt, but do not call Claude Code
  --max-rounds N     Audit/fix iterations before giving up (default 2)
  --yes, -y          Do not ask for confirmation before invoking Claude Code
  --fail-on LEVEL    error | warning | never  (default error)

Pipeline: design-audit  ->  design-report/FIXME.md  ->  claude  ->  re-audit
`);
}

function hasClaude() {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which',
    ['claude'], { stdio: ['ignore', 'pipe', 'ignore'] });
  return probe.status === 0;
}

function runAudit() {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'design-audit.js')], {
    cwd: ROOT, stdio: 'inherit',
  });
  if (res.error) throw res.error;
  if (!fs.existsSync(REPORT_JSON)) throw new Error('Audit did not produce a report.');
  return JSON.parse(fs.readFileSync(REPORT_JSON, 'utf8'));
}

/** The instruction handed to Claude Code. */
function buildPrompt() {
  return [
    'Read design-report/FIXME.md. It is an automated visual QA report produced by',
    'rendering this app in a real browser and inspecting the live DOM.',
    '',
    'Fix every task listed in it. Rules:',
    '- Change only the source files (assets/css/, assets/js/, index.html).',
    '- Do NOT edit anything under design-report/ — it is regenerated each run.',
    '- Do NOT weaken or delete audit rules in scripts/lib/design-rules.js to make',
    '  findings disappear. Fix the underlying UI problem.',
    '- Preserve the existing dark theme and the design tokens in CLAUDE.md.',
    '- Keep the full `npm test` suite passing.',
    '',
    'Findings are grouped: one failing CSS variable can appear dozens of times but',
    'is a single fix. Address the group, not each occurrence.',
    '',
    'When done, run `npm run verify` (tests + audit) and confirm both pass.',
  ].join('\n');
}

function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    });
  });
}

function invokeClaude(prompt) {
  return new Promise((resolve) => {
    log('\n  Handing off to Claude Code...\n', 'cyan');
    // Interactive by default so the operator can watch and intervene.
    const proc = spawn('claude', [prompt], { cwd: ROOT, stdio: 'inherit' });
    proc.on('exit', (code) => resolve(code === 0));
    proc.on('error', (err) => {
      log(`  Could not start claude: ${err.message}`, 'red');
      resolve(false);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  log('\nScorpion design fix loop', 'bold');

  let report = runAudit();
  let round = 0;

  while (round < args.maxRounds) {
    const s = report.summary;
    const blocking = args.failOn === 'warning'
      ? s.errors + s.warnings
      : s.errors;

    if (!blocking) {
      log(`\n  Design audit is clean (${s.warnings} non-blocking warning(s)).\n`, 'green');
      return;
    }

    round += 1;
    log(`\n  Round ${round}/${args.maxRounds}: ${s.errors} error(s), ${s.warnings} warning(s)`, 'yellow');
    log(`  Brief: ${path.relative(ROOT, FIXME)}`, 'dim');

    const prompt = buildPrompt();

    if (args.dryRun) {
      log('\n  --dry-run — prompt that would be sent to Claude Code:\n', 'dim');
      console.log(`${C.dim}${prompt.split('\n').map((l) => `    ${l}`).join('\n')}${C.reset}`);
      log(`\n  Run it yourself with:\n    claude "read design-report/FIXME.md and fix every task in it"\n`, 'cyan');
      return;
    }

    if (!hasClaude()) {
      log('\n  Claude Code CLI not found on PATH.', 'red');
      log('  Install:  npm install -g @anthropic-ai/claude-code', 'dim');
      log(`  Or fix manually from ${path.relative(ROOT, FIXME)}\n`, 'dim');
      process.exitCode = 1;
      return;
    }

    if (!args.yes) {
      const ok = await confirm(`\n  Invoke Claude Code to fix these? [y/N] `);
      if (!ok) {
        log(`\n  Skipped. The brief is at ${path.relative(ROOT, FIXME)}\n`, 'dim');
        return;
      }
    }

    await invokeClaude(prompt);

    log('\n  Re-auditing...\n', 'cyan');
    report = runAudit();
  }

  const s = report.summary;
  if (s.errors) {
    log(`\n  Still ${s.errors} error(s) after ${round} round(s). Review ${path.relative(ROOT, FIXME)}\n`, 'red');
    process.exitCode = 1;
  } else {
    log('\n  All blocking issues resolved.\n', 'green');
  }
}

if (require.main === module) {
  main().catch((err) => {
    log(`\n  ${err.message}\n`, 'red');
    process.exit(2);
  });
}
