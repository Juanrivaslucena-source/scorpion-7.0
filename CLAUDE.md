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
/* Before - fails at 3.58:1 on white */
--text-faint: #8585a0;

/* After - passes at 4.76:1 on white */
--text-faint: #64748b;
```

**Always compute the ratio; never assume one.** Darker text on a light
background raises contrast, so a "fix" that lightens a color usually makes
things worse. `#767676` on white is exactly 4.54:1 — a useful reference point
for sanity-checking any figure.

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

```
scorpion-7.0/
├── src/
│   ├── styles/           # CSS and design tokens
│   │   ├── variables.css # CSS custom properties
│   │   └── global.css    # Global styles
│   └── components/       # React/Vue/Svelte components
├── scripts/
│   ├── design-audit.js   # Main audit script
│   └── design-fix.js     # Auto-fix workflow
├── lib/
│   ├── audit-engine.js   # Audit orchestration
│   ├── cdp-client.js     # Chromium CDP client
│   └── rules/            # Audit rules
│       ├── contrast-rule.js
│       ├── overflow-rule.js
│       ├── oversized-icon-rule.js
│       └── text-collision-rule.js
├── CLAUDE.md             # This file
├── package.json
└── design-report/        # Generated audit reports
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
- Target: Full audit in < 10 seconds

## Common Pitfalls

1. **False Positives from CSS Gap**: Flex containers with `gap` property may report inflated `scrollWidth`. The overflow rule excludes these.

2. **Absolutely Positioned Elements**: Tooltips, popovers, and other out-of-flow elements are excluded from overflow checks.

3. **Dynamic Content**: The audit waits for page load but may miss dynamically rendered content. Consider adding delays for SPAs.

4. **Viewport Differences**: Always test at both desktop (1440px) and mobile (390px) viewports.

## Example Fix Session

### Scenario: Contrast failure for secondary text

**FIXME.md shows:**
```
## CONTRAST (error)

**Pattern:** Color: #8585a0
**Count:** 62 occurrences

### Example Findings:
- Contrast ratio 3.58:1 fails WCAG AA
  - Selector: .text-faint
  - Viewport: desktop (/)

### Suggested Fix
Update CSS variable or color value to meet WCAG AA contrast (4.5:1 for normal text, 3:1 for large text). Current color: #8585a0
```

**Claude Code Action:**
1. Find the CSS variable: `grep -r "8585a0" src/`
2. Locate in `src/styles/variables.css`: `--text-faint: #8585a0;`
3. Calculate the new ratio rather than estimating it - darkening raises contrast
4. Update: `--text-faint: #64748b;` (4.76:1 on white)
5. Verify: `npm run design:audit` shows 0 contrast findings

## Resources

- [WCAG Contrast Guidelines](https://www.w3.org/WAI/WCAG21/quickref/#contrast)
- [Color Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)

## Version

This file is for Scorpion 7.0. Update as the design system evolves.
