# Scorpion 7.0 - Design Audit System

A zero-dependency design audit system that automates visual QA by driving real Chromium over CDP (Chrome DevTools Protocol) using Node 22's built-in `WebSocket`.

## Features

- **Real Browser Testing**: Uses actual Chromium, not a simulation
- **Zero Dependencies**: Only requires Node 22+ (no Playwright, Puppeteer, or other packages)
- **Automatic Browser Provisioning**: Finds system Chromium or downloads it to `.cache/`
- **Comprehensive Rules**: Contrast, overflow, icon sizing, text collision, and more
- **Claude Code Integration**: Generates FIXME.md for automated fixes
- **Performance Optimized**: Full audit in ~8 seconds (12 viewports)

## Quick Start

```bash
# Install Node 22+
# Clone this repository

# Run the design audit
npm run design:audit

# Or let Claude Code fix issues automatically
npm run design:fix

# Run tests + audit (pre-commit gate)
npm run verify

# Try the demo
node demo.js
```

## The Pipeline

### 1. Audit

```bash
npm run design:audit
```

This:
- Renders all six views at 1440px and 390px in real Chromium
- Inspects the live DOM using CDP
- Runs all audit rules against each viewport
- Generates reports in `design-report/`

**Output:**
- `design-report/audit-results.json` - Full audit data
- `design-report/audit-report.md` - Human-readable report
- `design-report/FIXME.md` - Action items for Claude Code

### 2. Fix

```bash
npm run design:fix
```

This:
1. Runs the audit
2. Hands `FIXME.md` to the `claude` CLI with project instructions from `CLAUDE.md`
3. Re-runs the audit to verify fixes

**Requires:** [Claude Code CLI](https://github.com/anthropics/claude-code) installed

### 3. Verify

```bash
npm run verify
```

Runs tests + audit as a pre-commit gate. Fails if:
- Any tests fail
- Any design audit findings exist

## Demo Site

The repository includes a demo site with **intentional design bugs** to showcase the audit system:

```bash
# Start the demo site and run audit
node demo.js
```

This will:
1. Start a server at http://localhost:3000
2. Run the design audit against the demo site
3. Show you the findings

**Intentional bugs in the demo site:**
- Low contrast text (`--color-text-faint: #6b6b85` fails WCAG AA)
- Horizontal overflow (`.overflow-box` is 200% wide)
- Oversized icon (`.huge-icon` is 200px × 200px)

The audit should catch all three!

### Demo Site Structure

```
demo-site/
├── index.html      # Home page with hero and features
├── about.html     # About page with content cards
├── contact.html   # Contact page with form
├── styles.css     # CSS with intentional bugs
└── server.js      # Simple HTTP server
```

## Audit Rules

| Rule | Description | Severity |
|------|-------------|----------|
| `contrast` | WCAG AA contrast ratio (4.5:1 normal, 3:1 large text) | error |
| `horizontal-overflow` | Elements extending beyond viewport | error |
| `oversized-icon` | Icons > 2.5x parent font size | error |
| `text-collision` | Overlapping text elements | error |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DESIGN_AUDIT_BASE_URL` | `http://localhost:3000` | Base URL for audit |
| `DESIGN_AUDIT_ROUTES` | `/,/about,/contact,/dashboard,/settings,/profile` | Routes to audit |
| `DESIGN_AUDIT_TIMEOUT` | `30000` | Timeout per page in ms |
| `CHROME_PATH` | Auto-detected | Custom Chromium path |
| `CLAUDE_CLI_PATH` | `claude` | Path to Claude CLI |
| `DESIGN_AUDIT_SKIP_BROWSER` | `false` | Skip browser for testing |

### Custom Viewports

Edit `scripts/design-audit.js` to add custom viewports:

```javascript
viewports: [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 }
]
```

### Custom Rules

Add rules to `lib/audit-engine.js`:

```javascript
this.rules = [
  new ContrastRule(),
  new OverflowRule(),
  new OversizedIconRule(),
  new TextCollisionRule(),
  new MyCustomRule() // Add your custom rule
];
```

## Project Structure

```
scorpion-7.0/
├── lib/
│   ├── audit-engine.js      # Audit orchestration
│   ├── browser-resolver.js  # Browser discovery/provisioning
│   ├── cdp-client.js        # Chromium CDP client
│   ├── dom-utils.js         # DOM manipulation utilities
│   ├── websocket-fallback.js # WebSocket fallback
│   ├── rules/               # Audit rules
│   │   ├── contrast-rule.js
│   │   ├── overflow-rule.js
│   │   ├── oversized-icon-rule.js
│   │   └── text-collision-rule.js
│   └── kalshi/              # Kalshi probability agent
│       ├── signer.js            # RSA-PSS request signing
│       ├── client.js            # Trade API v2 client
│       ├── markets.js           # Market schema normalization
│       ├── probability-engine.js # Liquidity gates + signal blending
│       ├── llm-overlay.js       # Optional Claude refinement
│       ├── strategy.js          # Fractional Kelly sizing
│       ├── risk.js              # Hard limits + kill switch
│       ├── paper-broker.js      # The only order-placing module
│       ├── report.js            # kalshi-report/ output
│       └── signals/
│           ├── orderbook-signal.js
│           ├── no-arb-signal.js
│           └── event-consistency-signal.js
├── scripts/
│   ├── design-audit.js      # Main audit script
│   ├── design-fix.js        # Auto-fix workflow
│   └── kalshi-agent.js      # Kalshi agent entry point
├── demo-site/               # Demo website
│   ├── index.html
│   ├── about.html
│   ├── contact.html
│   ├── styles.css
│   └── server.js
├── tests/
│   ├── run.js               # Test runner
│   ├── unit.js              # Unit tests (63 tests)
│   ├── integration.js       # Integration tests (13 tests)
│   ├── kalshi.js            # Kalshi agent tests (87 tests)
│   ├── fixtures/            # Offline Kalshi payloads
│   └── dependency-check.js  # Dependency verification
├── docs/
│   └── ci/
│       └── design-audit.yml.example  # CI workflow template
├── demo.js                 # Demo script
├── CLAUDE.md                # Project instructions for Claude Code
├── package.json
└── README.md
```

## CI Integration

### GitHub Actions

1. Copy `docs/ci/design-audit.yml.example` to `.github/workflows/design-audit.yml`
2. Uncomment the `on:` section
3. Adjust `DESIGN_AUDIT_BASE_URL` to your application's URL
4. Commit and push

### Manual Setup

The workflow template is provided as an example because GitHub Apps cannot create workflow files without the `workflows` permission. To enable:

```bash
# Copy the template
cp docs/ci/design-audit.yml.example .github/workflows/design-audit.yml

# Edit the file and uncomment the trigger section
# Then commit and push
```

## Performance Optimizations

The audit system includes several optimizations to achieve ~8s for 12 viewports:

1. **Spatial Bucketing**: Text collision detection is O(n) per parent instead of O(n²) overall
2. **Cached Computed Styles**: Styles are cached to avoid redundant CDP calls
3. **Smart Navigation**: Handles same-document navigation (hash changes) without waiting for load events
4. **Flex Container Exclusion**: Excludes flex containers with `gap` property from overflow checks (false positive prevention)
5. **Out-of-Flow Exclusion**: Skips absolutely positioned elements from overflow checks

## Real-World Example

### The Contrast Bug

**Problem:** `--text-faint: #6b6b85` failed WCAG AA at 3.30:1 on card surfaces

**Finding:** 62 findings across every view from a single CSS variable

**Fix:** Changed to `--text-faint: #8585a0` (4.76:1 on cards)

**Result:** 25 errors → 0

### The Icon Bug

**Problem:** SVG icon rendered at 164x150px with parent font-size 12px

**Finding:** `oversized-icon` rule caught it

**Fix:** Set explicit `width: 1.5em; height: 1.5em;` on icon

**Verification:** Reintroducing the bug produces the exact finding

## Browser Provisioning

The system automatically finds or provisions Chromium:

1. **System Chromium**: Checks common locations on macOS, Linux, Windows
2. **PATH**: Checks if `chromium-browser`, `chromium`, `google-chrome`, or `chrome` is in PATH
3. **Download**: Downloads Chromium to `.cache/chromium/` if not found

The `.cache/` directory is gitignored.

## Zero Dependencies

The system uses only Node 22 built-in modules:

- `node:fs` - File system operations
- `node:path` - Path manipulation
- `node:os` - OS information
- `node:child_process` - Process spawning
- `node:events` - Event handling
- `node:websocket` - WebSocket client (for CDP)
- `node:crypto` - RSA-PSS request signing
- `node:test` - Test runner
- `node:assert` - Assertions

This is verified by `tests/dependency-check.js`.

## Kalshi Probability Agent

A second, independent subsystem lives under `lib/kalshi/` and `scripts/kalshi-agent.js`.
It scans [Kalshi](https://kalshi.com) prediction markets, estimates a fair probability
for each, and sizes positions on the ones the market appears to misprice.

```bash
# Analysis only — cannot place orders regardless of flags
npm run kalshi:scan

# Full loop; still a dry run unless --place is given
npm run kalshi:agent

# Paper trade against Kalshi's demo environment
KALSHI_ENV=demo npm run kalshi:agent -- --place
```

### Safety model

Placing an order requires four independent conditions, and every one is off by default:

1. `KALSHI_ENV=prod`
2. `KALSHI_ALLOW_LIVE=I_UNDERSTAND_REAL_MONEY` (exact string)
3. The `--place` flag
4. A passing risk preflight

Without all four the agent runs in dry-run or paper mode. `lib/kalshi/paper-broker.js`
is the only module that submits orders — nothing else calls the order endpoint, which
is what makes that gate meaningful. Dropping a file at `kalshi-report/.halt` halts
trading immediately, and the halt check fails closed if it cannot read that path.

Risk limits (`lib/kalshi/risk.js`) cap per-order size, per-market exposure, total
exposure, and daily realized loss. Sizing is quarter-Kelly, not full Kelly, because
the probability estimate is an estimate.

### How probabilities are estimated

Deterministic signals produce the baseline:

| Signal | What it uses |
| --- | --- |
| `orderbook-signal.js` | Size-weighted microprice from the resting book |
| `no-arb-signal.js` | Detects `yesBid + noBid > 100` — reported, never traded single-leg |
| `event-consistency-signal.js` | Mutually exclusive event legs that do not sum to 1 |

An optional Claude pass (`llm-overlay.js`) then refines the top candidates. It is
capped at half the blend weight, and no API key, a network failure, a malformed
reply, or a safety refusal all degrade silently to the deterministic baseline.

### Configuration

`KALSHI_ENV`, `KALSHI_API_KEY_ID`, `KALSHI_PRIVATE_KEY_PATH`, `ANTHROPIC_API_KEY`,
plus tuning variables documented in the JSDoc header of each module. Private keys are
gitignored; never commit one.

### Running offline

The whole pipeline runs without network access or credentials from a fixture:

```bash
npm run kalshi:scan -- --fixture tests/fixtures/kalshi-markets.json --no-llm
```

## Tests

Run all tests:
```bash
npm test
```

Or individually:
```bash
npm run test:unit
npm run test:integration
npm run test:kalshi
```

Current test count: **163 tests** (63 unit + 13 integration + 87 Kalshi)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add your changes
4. Run `npm run verify`
5. Submit a pull request

### Adding a New Rule

1. Create a new file in `lib/rules/` (e.g., `my-rule.js`)
2. Export a class with:
   - `id` - Unique rule identifier
   - `name` - Human-readable name
   - `description` - Rule description
   - `severity` - 'error', 'warning', or 'info'
   - `audit(domTree, getComputedStyle, context)` - Audit method returning findings
3. Add the rule to `lib/audit-engine.js`
4. Add tests in `tests/unit.js`

### Rule Development Tips

- Use `context.getBoundingRect(node)` for element dimensions
- Use `context.getComputedStyle(node)` for computed styles
- Use `context.viewportWidth` and `context.viewportHeight` for viewport info
- Group findings by pattern to reduce noise (see `ContrastRule.groupFindings()`)
- Exclude false positives (e.g., flex containers with gap, out-of-flow elements)

## Troubleshooting

### "WebSocket is not available"

Ensure you're using Node 22+. Run `node --version` to check.

### "No browser found"

The system will automatically download Chromium to `.cache/`. If this fails:
- Check your internet connection
- Set `CHROME_PATH` environment variable to a Chromium executable
- Ensure you have write permissions in the project directory

### "Audit timeout"

Increase the timeout:
```bash
DESIGN_AUDIT_TIMEOUT=60000 npm run design:audit
```

Or reduce the number of routes:
```bash
DESIGN_AUDIT_ROUTES=/,/about npm run design:audit
```

### "Claude CLI not found"

Install the Claude Code CLI from https://github.com/anthropics/claude-code

Or set `CLAUDE_CLI_PATH` to the full path:
```bash
CLAUDE_CLI_PATH=/usr/local/bin/claude npm run design:fix
```

## License

MIT
