# Claude Code Project Instructions for Scorpion 7.0

## Project Overview

Scorpion 7.0 is a design system and web application with strict visual quality standards. This file provides guidance for Claude Code when fixing design issues automatically detected by the audit system.

## Core Principles

### 1. Fix the UI, Never the Rules

**Most Important:** When the design audit finds issues, fix the user interface, not the audit rules. The rules encode design system requirements that must not be weakened to make findings disappear.

### 2. Design System First

Always prefer fixing issues in the design system (CSS variables, base styles) over individual component fixes. One CSS variable fix can resolve dozens of findings.

### 3. Accessibility is Non-Negotiable

- WCAG AA contrast minimum: 4.5:1 for normal text, 3:1 for large text (18.66px+ bold or 24px+)
- Touch targets: Minimum 48x48px
- All interactive elements must have accessible names
- Focus indicators must be visible

**Only the first of these is enforced by a rule.** `lib/rules/` contains exactly four
rules: contrast, overflow, oversized-icon, and text-collision. Touch-target size,
accessible names, and focus indicators are project standards that a human must check —
the audit will not catch them and will not report them. Do not infer from a clean audit
that they hold.

## Common Fix Patterns

### Contrast Issues

**Problem:** Text fails WCAG AA contrast ratio.

**Solution:**
1. Identify the CSS variable or color value causing the issue
2. Use a color contrast checker to find the minimum adjustment needed
3. Update the color in the design tokens or CSS variables
4. Verify the change doesn't break the visual design

**Example:**
```css
/* Before - fails at 4.41:1 on white */
--color-text-faint: #767690;

/* After - passes at 5.16:1 on white */
--color-text-faint: #6b6b85;
```

**Every ratio quoted in this file is machine-checked.** `tests/unit.js` recomputes
them with `lib/rules/contrast-rule.js` and fails if a number here drifts from what the
code actually produces. Do not hand-edit a ratio into this document — compute it:

```bash
node -e 'const{getContrastRatio}=require("./lib/rules/contrast-rule.js");
         console.log(getContrastRatio("#767690","#ffffff").toFixed(2))'
```

A previous version of this file claimed `#6b6b85` was 3.30:1 (it is 5.16:1, passing)
and directed agents to "fix" it to `#8585a0` (which is 3.58:1, failing). That guidance
was wrong in the most damaging possible direction — it turned a passing color into a
failing one. The machine-check above exists so that cannot recur.

### Horizontal Overflow

**Problem:** Elements extend beyond the viewport width.

**Solution:**
1. Check if the overflow is intentional (e.g., horizontal scrolling container)
2. If unintentional:
   - Reduce element width
   - Add `overflow-x: auto` or `overflow-x: hidden`
   - Adjust layout (flexbox, grid) to wrap or constrain content
   - Fix CSS `gap` on flex containers (false positive source)

**Note:** Flex containers with `gap` property may report inflated `scrollWidth`. Verify by checking actual rendering.

### Oversized Icons

**Problem:** SVG or icon elements exceed 2.5x their parent's font size.

**Solution:**
1. Set explicit `width` and `height` on the icon
2. Use `em` units to scale relative to font size
3. Adjust parent font size if icons are consistently too large

**Example:**
```css
/* Before - icon inherits full parent size */
.icon { width: 100%; height: 100%; }

/* After - icon constrained to 1.5em */
.icon { width: 1.5em; height: 1.5em; }
```

### Text Collision

**Problem:** Text elements overlap in the rendered output.

**Solution:**
1. Add margin or padding between elements
2. Adjust positioning (absolute, relative, fixed)
3. Fix line height or font size issues
4. Ensure proper flexbox/grid alignment

## File Structure

There is **no `src/` directory** and no React/Vue/Svelte in this repo. The audited
markup and CSS live in `demo-site/`, as plain HTML and hand-written CSS. Earlier
versions of this file described a `src/` tree that never existed, which sent agents
looking for files that were not there.

```
scorpion-7.0/
├── demo-site/            # The site under audit (plain HTML/CSS)
│   ├── index.html
│   ├── about.html
│   ├── contact.html
│   ├── styles.css        # All design tokens live here, in :root
│   └── server.js         # Static file server for the audit target
├── scripts/
│   ├── design-audit.js   # Main audit script
│   └── design-fix.js     # Auto-fix workflow
├── lib/
│   ├── audit-engine.js   # Audit orchestration
│   ├── browser-resolver.js # Locates a Chromium binary
│   ├── cdp-client.js     # Chromium CDP client
│   ├── dom-utils.js      # CDP DOM/style helpers
│   └── rules/            # Audit rules
│       ├── contrast-rule.js
│       ├── overflow-rule.js
│       ├── oversized-icon-rule.js
│       └── text-collision-rule.js
├── tests/                # run.js, unit.js, integration.js, dependency-check.js
├── .claude/skills/       # Project skills (llm-council, boil-the-ocean)
├── CLAUDE.md             # This file
├── package.json
└── design-report/        # Generated audit reports (gitignored)
    ├── audit-results.json
    ├── audit-report.md
    └── FIXME.md           # Action items for Claude Code
```

## Design Tokens

The design system uses CSS custom properties (variables) for all colors, spacing, and typography. Always prefer updating variables over hard-coded values.

### Color Variables

```css
:root {
  /* Primary palette */
  --color-primary-50: #f0f9ff;
  --color-primary-100: #e0f2fe;
  --color-primary-500: #3b82f6;
  --color-primary-600: #2563eb;
  
  /* Semantic colors */
  --color-text-primary: var(--color-gray-900);
  --color-text-secondary: var(--color-gray-600);
  --color-text-faint: var(--color-gray-500);
  
  /* Backgrounds */
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-tertiary: #f1f5f9;
}
```

### Spacing Scale

```css
:root {
  --space-xs: 0.25rem;   /* 4px */
  --space-sm: 0.5rem;    /* 8px */
  --space-md: 1rem;      /* 16px */
  --space-lg: 1.5rem;    /* 24px */
  --space-xl: 2rem;      /* 32px */
  --space-2xl: 3rem;     /* 48px */
}
```

## Workflow

### 1. Audit

```bash
npm run design:audit
```

This generates:
- `design-report/audit-results.json` - Full audit data
- `design-report/audit-report.md` - Human-readable report
- `design-report/FIXME.md` - Action items for Claude Code

### 2. Fix

```bash
npm run design:fix
```

This:
1. Runs the audit
2. Hands FIXME.md to Claude Code with these instructions
3. Re-runs the audit to verify fixes

### 3. Verify

```bash
npm run verify
```

Runs tests + audit as a pre-commit gate.

## Testing

All changes must pass:
- Unit tests for audit rules
- Integration tests for the audit engine
- The design audit itself (0 findings for production)

## Performance Considerations

- The audit uses real Chromium via CDP, not a headless browser simulation
- Optimizations include:
  - Spatial bucketing for collision detection (O(n) per parent vs O(n²) overall)
  - Cached computed styles
  - Smart viewport handling
- Target: **unestablished.** The previously documented "< 10 seconds for 12 viewports"
  was measured while the browser layer was a no-op that audited nothing. Re-measure
  against real Chromium before quoting a number, and do not let an unmet performance
  target become an argument for skipping the browser.

## Common Pitfalls

Everything in this section was written before the audit had ever run against a real
DOM. Treat it as untested hypothesis, and confirm against an actual run before acting
on it.

1. **False Positives from CSS Gap**: Flex containers with `gap` property may report inflated `scrollWidth`. The overflow rule excludes these.

2. **Absolutely Positioned Elements**: Tooltips, popovers, and other out-of-flow elements are excluded from overflow checks.

3. **Dynamic Content**: The audit waits for page load but may miss dynamically rendered content. Consider adding delays for SPAs.

4. **Viewport Differences**: Always test at both desktop (1440px) and mobile (390px) viewports. Note that `dom-utils.js` sets `mobile: false` in `Emulation.setDeviceMetricsOverride`, so mobile media queries do not currently match at 390px.

## Example Fix Session

### Scenario: Contrast failure for secondary text

**FIXME.md shows:**
```
## CONTRAST (error)

**Pattern:** Color: #767690
**Count:** 3 occurrences

### Example Findings:
- Contrast ratio 4.41:1 fails WCAG AA
  - Selector: .text-faint
  - Viewport: desktop (/)

### Suggested Fix
Update CSS variable or color value to meet WCAG AA contrast (4.5:1 for normal text, 3:1 for large text). Current color: #767690
```

**Claude Code Action:**
1. Find the CSS variable: `grep -rn "767690" demo-site/`
2. Locate in `demo-site/styles.css`: `--color-text-faint: #767690;`
3. Compute a candidate with the project's own code — never a remembered number:
   ```bash
   node -e 'const{getContrastRatio}=require("./lib/rules/contrast-rule.js");
            console.log(getContrastRatio("#6b6b85","#ffffff").toFixed(2))'   # 5.16
   ```
4. Update: `--color-text-faint: #6b6b85;` (5.16:1 on white)
5. Verify: `npm run design:audit` shows 0 contrast findings

**Note on counts:** a finding count of "62 occurrences" in an older version of this
document was never produced by a real audit — the browser layer had never run. Treat
any pre-2026 figure in `design-report/` as fiction and regenerate it.

## Resources

- [WCAG Contrast Guidelines](https://www.w3.org/WAI/WCAG21/quickref/#contrast)
- [Color Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)

## Version

This file is for Scorpion 7.0. Update as the design system evolves.
