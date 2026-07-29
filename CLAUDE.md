# Scorpion 7.0 — instructions for Claude Code

Autonomous AI operations platform for dropshipping. Static frontend, Node scripts,
JSON data files. **No framework, no build step, no bundler, no dependencies.**

## Hard constraints

1. **Zero runtime dependencies.** `package.json` has no `dependencies` block and
   must stay that way. Everything uses Node built-ins or browser APIs. Do not
   introduce React, a bundler, a test framework, or a CSS preprocessor.
2. **No build step.** `index.html` loads plain `.js` files with `<script src>`.
   Browser JS is ES5-compatible IIFEs attaching to `window`; Node scripts use
   CommonJS. Do not convert either to ES modules.
3. **Module data ownership.** `scout.js` owns `data/products.json`,
   `studio.js` owns `data/content.json`, `tracker.js` owns `data/sales.json`.
   Never write another module's file directly — go through its exported reader.
4. **Everything degrades without API keys.** `ARENA_API_KEY`, `FABLE_API_KEY`
   and `RUNWAY_API_KEY` are all optional; unset means simulated responses or
   cached fixtures. Never make a code path require a key.

## Commands

```bash
npm test              # 74 dependency-free tests — must stay green
npm run design:audit  # browser-based visual QA — must report PASS
npm start             # dev server on :4173
npm run seed          # reset data/ from data/seed/
npm run orchestrate:once
```

Run **both** `npm test` and `npm run design:audit` before considering work done.

## Layout

| Path | Owns |
|---|---|
| `index.html` | Shell, SVG sprite, view containers |
| `assets/css/dashboard.css` | The entire theme |
| `assets/js/api.js` | Data loading, formatting, service wrappers |
| `assets/js/auth.js` | GitHub OAuth + demo session |
| `assets/js/router.js` | Browser-side task router |
| `assets/js/dashboard.js` | View rendering (`skeleton()` / `render(state)`) |
| `assets/js/app.js` | Boot, navigation, event delegation |
| `modules/*/` | Node business logic + its JSON schema |
| `scripts/` | Orchestrator, integrations, dev server, audits |
| `data/` | Live state (generated — do not hand-edit) |
| `design-report/` | Audit output (generated — never edit) |

## Design system

Defined as CSS custom properties at the top of `dashboard.css`. Use the
variables, never raw hex values.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0a0f` | Page background |
| `--sidebar` | `#12121a` | Sidebar |
| `--card` | `#1a1a2e` | Card surfaces |
| `--border` | `#2a2a3a` | 1px borders |
| `--accent` | `#00d4aa` | Primary actions, positive values |
| `--text` / `--text-dim` / `--text-faint` | | Text hierarchy |

Cards: 8px radius, 1px border, subtle lift on hover. Transitions 200ms ease.
Respect `prefers-reduced-motion`.

## The design audit

`npm run design:audit` renders every view at desktop (1440px) and mobile (390px)
in real Chromium over CDP, then inspects the live DOM. It catches what static
checks cannot: oversized icons, clipped content, overlapping text, contrast
failures, template artifacts leaking into the UI.

Output lands in `design-report/`:
- `REPORT.md` — human summary
- `FIXME.md` — prioritized work order
- `report.json` — machine-readable
- `screens/` — screenshots

**When fixing audit findings:**
- Fix the UI, not the rule. Never weaken or delete a rule in
  `scripts/lib/design-rules.js` to make a finding disappear.
- Findings are grouped: one failing colour variable may appear 30 times but is
  a single fix. Address the group, not each occurrence.
- Re-run the audit to confirm. Do not mark a task done without it.

Adding a rule is legitimate when you find a *new class* of bug — put it in
`design-rules.js` with a comment explaining the real defect it caught, and add
guidance to `RULE_GUIDANCE` in `scripts/design-audit.js`.

## Adding things

**A view:** add `<section class="view" id="view-x">` to `index.html`, a nav
button with `data-view="x"`, and export `{title, sub, skeleton(), render(state)}`
from `ScorpionViews` in `dashboard.js`. Add `'x'` to the `VIEWS` array in
`app.js` and in `scripts/design-audit.js`. Routing and skeletons are automatic.

**A task type:** add a route to `taskRoutes` in `models.json`, a system prompt
in `arena-router.js`, a simulated branch in `simulate()`, and optionally a
handler in `orchestrate.js`.

## Data invariants

The test suite enforces these — do not break them:
- Every product margin equals `(salePrice - cost) / salePrice`, and every
  product clears 3x markup.
- Sales totals recompute exactly from the order list.
- Every clip and order references a real product id.
- Exactly 3 clips per product in seed data.
