# Project Status

An honest account of what exists, what is simulated, and what still needs a human.
Read this before trusting anything else in the repo.

Last updated: 2026-07-29

---

## 1. What is actually connected

The original bootstrap prompt described a system where Arena.ai routes tasks to 100+
specialist models and Fable 5 handles live browsing. That is the **target
architecture**, and the code is shaped for it. It is not the current runtime state.

| Component | Status | Reality |
|---|---|---|
| **Scorpion console** | Working | Static frontend, runs offline, reads `data/*.json` |
| **Orchestrator** | Working | Task queue, handlers, writes results back |
| **Model registry + router** | Working | Real routing logic, cost ceilings, spend tracking |
| **Design audit** | Working | Drives real Chromium, catches real bugs |
| **Arena.ai API** | **Not connected** | `scripts/arena-router.js` is a complete client. No key set, so it returns simulated responses |
| **Fable 5** | **Not connected** | `scripts/fable-agent.js` is a complete client. No key set, so it returns cached fixtures |
| **RunwayML** | **Not connected** | Client written. Credits debited locally for budget tracking only |
| **GitHub OAuth** | **Half done** | Browser flow complete; needs a server-side token exchange you deploy |
| **Shopify / TikTok Shop** | **Not connected** | `tracker.js` normalizes their payload shapes; nothing is fetching them |

**Nothing in this repo has spent money or touched a real storefront.**

### The multi-agent framing

The bootstrap prompt assumed an agent that dispatches work to a roster of named
specialists. The actual build was done by a single coding agent with a shell, git,
web search, and page fetching. Where the prompt said "route trend research to models
with live knowledge," what happened is that the agent ran the searches itself.

This matters because `models.json` looks like infrastructure and is not. It is a
**routing table the orchestrator obeys** — real logic, real cost ceilings — but the
models behind it are only reachable once `ARENA_API_KEY` is set.

---

## 2. Where the seed data came from

The demo data mixes real sourcing figures with fabricated performance history.

**Real.** Product costs, seller ratings, and shipping windows were pulled from live
AliExpress result pages during the build:

| Product | Cost | Rating | Units sold | Source |
|---|---|---|---|---|
| Grout Restore Pen | $2.66 | 4.9 | 2,000+ | Live AliExpress listing |
| Car Detailing Gel | $1.33 | 4.9 | 1,000+ | Live AliExpress listing |
| UV Resin Repair Pen | $0.99 | 3.8 | 166 | Live AliExpress listing |
| Rust Remover Gel | $0.99–1.33 | 4.2–4.9 | 22–1,000 | Live AliExpress listing |

Those same figures back the Fable fixtures in `scripts/fable-agent.js`, so offline
runs exercise realistic numbers rather than round placeholders.

**Fabricated.** Order history, view counts, conversion rates, and the $4,142
revenue figure. The sales curve was generated with a seeded PRNG to look
plausible — growth ramp, weekend lift, a mid-month viral spike. Treat every
performance number in the console as illustration, not a track record.

---

## 3. Deliberate decisions

Choices made during the build that a reader might otherwise question.

### Teal accent instead of purple
The spec said "purple `#7c3aed` or teal `#00d4aa` — pick the more modern one."
Teal reads as instrumentation rather than generic AI-product purple, and it stays
legible against `#1a1a2e` cards at small sizes. Purple survives as the
`researching` stage badge.

### OAuth cannot be finished client-side
GitHub's token exchange requires the client secret, which must never ship to the
browser. The browser half is complete — authorize redirect, `state` anti-forgery,
callback handler. The exchange endpoint is yours to deploy; `pipeline/PIPELINE.md`
has a copy-paste Vercel function. Demo mode exists so nothing is gated on it.

### Everything degrades without keys
No code path requires an API key. Unset means simulated responses or cached
fixtures. This is what makes the test suite meaningful — the whole system runs
end-to-end offline, in CI, with no credentials.

### Zero runtime dependencies
`package.json` has no `dependencies` block, and a test enforces that. The design
audit drives Chromium over the DevTools Protocol using Node 22's built-in
`WebSocket` rather than pulling in Playwright (~300MB plus its own browser
download). Adding a bundler or framework later would be a real architectural
change, not a convenience.

### Screenshots committed to Git
`docs/screenshots/` adds ~2.2MB. They go stale on UI changes and bloat history if
regenerated often. Kept because a README with pictures is worth more than a clean
diff — but this is a reasonable thing to reverse. The audit regenerates equivalent
images into the gitignored `design-report/screens/` on every run.

### CI ships as a template
`docs/ci/design-audit.yml.example` is not active. GitHub rejects workflow files
pushed by an App without `workflows` permission. Two commands in the README
activate it.

---

## 4. Bugs found, and how

A record of what each verification layer actually caught, because it shows which
layers earn their keep.

### Caught by static checks and tests
- Margin arithmetic drifting from `(salePrice − cost) / salePrice`
- Sales totals not reconciling against the order list
- Clips and orders referencing product ids that do not exist
- Route table entries pointing at models absent from the registry

### Caught by running the pipeline
The first scout cycle produced three products with **identical links, costs, and
hooks**. Two real bugs: the Fable fixture ignored the query string, and the hook
generator was hardcoded. Fixed with query-keyed fixtures plus a deterministic
synthetic fallback, and hooks that rotate per product.

### Caught only by rendering in a browser
Static checks passed cleanly on all of these, because the markup was valid — it
just looked wrong.

| Bug | Cause |
|---|---|
| KPI icons rendering at ~164px | `icon()` emitted `<svg>` with no width/height; nothing constrained it inside cards |
| "3 Running" with 2 running | Badge counted queued tasks as running |
| Margin column clipped | Shared `min-width: 560px` forced overflow inside a half-width card |
| Login footer colliding with button | `.btn-block` overrode the footer margin |

These four are now encoded as rules in `scripts/lib/design-rules.js`. Reintroducing
the icon bug was tested and produces `164x150px rendered, parent font-size 12px`.

### Caught by the design audit, first run
`--text-faint` (`#6b6b85`) failed WCAG AA at **3.30:1** on card surfaces — 62
findings across every view from one CSS variable. Changed to `#8585a0` (4.76:1 on
`--card`, 5.20 on `--sidebar`, 5.68 on tooltips). Errors went 25 → 0.

**The lesson:** valid markup and passing tests say nothing about whether a UI is
correct. Rendering is a distinct verification layer.

---

## 5. Performance notes

The first design audit implementation took **300s+** and got killed before writing
a report. Profiling found the cost was not where it looked:

| Stage | Before | After |
|---|---|---|
| Same-document navigation | 30,001ms | ~50ms |
| Wait for render | 8,040ms | ~200ms |
| Rule evaluation | 7ms | 7ms |
| **Full run, 12 combinations** | **300s+** | **~8s** |

The dominant cost was a navigation stall: a URL differing only by `#hash` fires no
load event, so waiting for one always burned the full timeout. `cdp.js` now detects
same-document navigation and resolves immediately.

The rules themselves were never slow, but two were quadratic on dense views and
were fixed anyway — collision checks bucket by parent, contrast checks memoize
backdrop lookups.

### False positives removed
- **Flex `gap` counted as overflow.** `scrollWidth` includes column-gap even when
  nothing is clipped. Now verified against real child geometry.
- **Absolutely-positioned tooltips counted as overflow.** Out-of-flow children
  cannot clip a parent. Now skipped.
- **62 contrast findings for one variable.** Findings now group by root cause, so
  the brief lists 3 fixes instead of 62 symptoms.

51 raw errors → 25 real ones → 0 after the contrast fix.

---

## 6. What still needs a human

Anything touching money, accounts, or credentials.

**Blocking a real product cycle**
- [ ] Order a sample of the top pick before committing inventory float
- [ ] Open the storefront (Shopify or TikTok Shop)
- [ ] Supplier payment — AliExpress escrow only, per `COMMAND_CENTER.md`

**Blocking live automation**
- [ ] `ARENA_API_KEY` — turns simulated routing into real model calls
- [ ] `FABLE_API_KEY` — turns fixtures into live scraping
- [ ] `RUNWAY_API_KEY` — turns simulated renders into real video
- [ ] Deploy the OAuth token-exchange endpoint, set it in Settings

**Open decisions**
- [ ] Keep `docs/screenshots/` in Git, or drop it and rely on the audit?
- [ ] Activate the CI workflow from `docs/ci/`?
- [ ] Generate `pipeline/product-scout-report-1.md`? It would come from the
      simulated path and read as placeholder-grade. A real pass needs live
      sourcing — worth doing properly or not at all.

---

## 7. Verification

```bash
npm test              # 106 tests, no dependencies, no network
npm run design:audit  # renders 6 views x 2 viewports in real Chromium
npm run verify        # both
```

Current state: **106 tests passing, 0 audit errors, 4 warnings** (undersized filter
chips in the scout view).

What the suites do *not* cover: no live API calls are exercised, `design:fix`'s
invocation of the `claude` CLI is untested end-to-end (the CLI is not installed in
the build environment), and there is no visual regression baseline — the audit
checks rules, not pixel diffs.
