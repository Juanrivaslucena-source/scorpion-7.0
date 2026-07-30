# Scorpion 7.0 - Design Audit System

A zero-dependency design audit system that automates visual QA by driving real Chromium over CDP (Chrome DevTools Protocol) using Node 22's built-in `WebSocket`.

## Features

- **Real Browser Testing**: Uses actual Chromium, not a simulation
- **Zero Dependencies**: Only requires Node 22+ (no Playwright, Puppeteer, or other packages)
- **Automatic Browser Provisioning**: Finds system Chromium or downloads it to `.cache/`
- **Comprehensive Rules**: Contrast, overflow, icon sizing, text collision, and more
- **Claude Code Integration**: Generates FIXME.md for automated fixes
- **Honest Reporting**: distinguishes "clean" from "did not run" via exit codes

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
- Renders each configured route at 1440px and 390px in real Chromium
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
| `DESIGN_AUDIT_ROUTES` | `/,/about,/contact` | Routes to audit |
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
│   ├── cdp-socket.js     # EventEmitter adapter over the global WebSocket
│   ├── chrome-launcher.js # Launch + DevToolsActivePort endpoint discovery
│   ├── color.js          # CSS colour parsing and WCAG luminance
│   └── rules/               # Audit rules
│       ├── contrast-rule.js
│       ├── overflow-rule.js
│       ├── oversized-icon-rule.js
│       └── text-collision-rule.js
├── scripts/
│   ├── design-audit.js      # Main audit script
│   └── design-fix.js        # Auto-fix workflow
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

The audit runs 6 page-renders (3 routes x 2 viewports) in roughly 5 seconds on a
warm machine. Any earlier figure in this file was measured while the browser layer
was a no-op that inspected nothing. Optimizations:

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
- Global `WebSocket` (built into Node 22) - CDP transport
- Global `fetch` (built into Node 22) - route status pre-checks
- `node:test` - Test runner
- `node:assert` - Assertions

This is verified by `tests/dependency-check.js`.

## Tests

Run all tests:
```bash
npm test
```

Or individually:
```bash
npm run test:unit
npm run test:integration
```

Current test count: **76 tests** (63 unit + 13 integration)

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

## Exit codes

`design:audit` distinguishes "clean" from "did not run". Conflating the two is how a
no-op audit acted as a passing pre-commit gate for the life of this project.

| Code | Meaning |
|------|---------|
| `0` | Audit ran and found nothing |
| `1` | Audit ran and found issues — see `design-report/FIXME.md` |
| `2` | Skipped by request (`DESIGN_AUDIT_SKIP_BROWSER=true`). **Not a pass.** |
| `3` | Infrastructure failure: could not launch, a route returned non-2xx, or zero pages were inspected |

Only `0` is a pass. `npm run verify` runs the real audit — it can no longer be
satisfied by the skip path. Reports lead with `pagesAudited` / `pagesFailed` so
"0 findings" is never readable without its denominator.
