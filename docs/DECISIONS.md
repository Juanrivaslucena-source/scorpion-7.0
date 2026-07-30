# Decision Log

Architectural decisions with their reasoning and consequences. Each entry records
what was chosen, what it rules out, and what would justify revisiting it.

Format is loosely [ADR](https://adr.github.io/). Newest last.

---

## 1. Static frontend, no framework, no build step

**Decision.** Plain HTML/CSS/JS. Browser code is ES5-compatible IIFEs attaching to
`window`; Node code is CommonJS. `index.html` loads scripts with `<script src>`.

**Why.** The console's job is to render JSON that Node scripts produce. A framework
would add a build step, a dependency tree, and a compile-watch loop for a UI that is
six views of tables and cards. Deploying to GitHub Pages is `git push`.

**Consequences.**
- No JSX, no reactive state, no component library. Views are string-building
  functions returning HTML.
- Re-rendering is coarse: a view repaints wholesale rather than diffing.
- Anyone can open `dashboard.js` and read exactly what produces the DOM.

**Revisit if.** The UI grows interactive state that outlives a render — drag and
drop, inline editing, optimistic updates. String concatenation gets ugly fast once
you need to preserve focus or scroll position.

---

## 2. Zero runtime dependencies

**Decision.** `package.json` has no `dependencies` block. A test enforces it.

**Why.** Every dependency is a supply-chain risk, a version conflict, and a reason
the project stops building in eighteen months. Node's standard library covers
everything needed: `http` for the dev server, `fetch` and `WebSocket` for network,
`zlib` for decompression, `child_process` for the browser.

**Consequences.**
- The test runner is 60 lines in `selftest.js` rather than Jest.
- The design audit talks raw CDP instead of using Playwright.
- Some code is more verbose than the library equivalent.

**Revisit if.** A genuinely hard problem appears that is unreasonable to hand-roll —
image diffing, PDF generation, a real database. Convenience is not sufficient
reason.

---

## 3. Teal accent over purple

**Decision.** `--accent: #00d4aa`. Purple `#7c3aed` retained only for the
`researching` stage badge.

**Why.** The spec offered both and asked for "the more modern one." Purple has
become shorthand for *generic AI product*. Teal reads as instrumentation — closer
to a trading terminal than a chatbot — which suits an operations console. It also
holds contrast better against `#1a1a2e` cards at 11–12px label sizes.

**Consequences.** Positive numbers, primary buttons, and active nav all share one
accent, so the eye tracks a single colour for "this is the important thing."

**Revisit if.** Brand direction changes. It is one CSS variable.

---

## 4. Everything degrades without API keys

**Decision.** No code path requires a credential. Missing `ARENA_API_KEY` yields
deterministic simulated responses; missing `FABLE_API_KEY` yields cached fixtures
captured from real AliExpress pages; missing `RUNWAY_API_KEY` yields simulated job
ids with credits still debited locally for budget tracking.

**Why.** A system that only runs with four API keys cannot be tested, cannot run in
CI, and cannot be handed to someone to try. Simulated mode is not a stub — it is a
first-class execution path that exercises the same routing, persistence, and
reporting code.

**Consequences.**
- The full test suite runs offline with no credentials.
- Simulated output must stay schema-correct, or tests pass against fiction.
- Every new task type needs a `simulate()` branch. This is a documented step in
  `CLAUDE.md`, not an optional extra.

**Revisit if.** Never, ideally. The moment a key becomes mandatory, CI dies.

---

## 5. Module data ownership

**Decision.** `scout.js` owns `data/products.json`, `studio.js` owns
`data/content.json`, `tracker.js` owns `data/sales.json`. Cross-module reads go
through the owning module's exported reader; nobody writes another module's file.

**Why.** Four scripts writing the same JSON concurrently is a corruption bug waiting
to happen, and it makes "who changed this field" unanswerable.

**Consequences.** `tracker.js` imports the product catalog through `scout`'s reader
to backfill unit costs, rather than reading the file directly.

**Revisit if.** The data layer moves to a real database with transactions, at which
point the ownership rule can relax into row-level concerns.

---

## 6. GitHub OAuth needs a server-side exchange

**Decision.** Implement the browser half fully — authorize redirect, `state`
anti-forgery token, callback handler. Leave the token exchange to an endpoint the
operator deploys, configured in Settings. Ship demo mode so the console is usable
without any of it.

**Why.** GitHub's web application flow requires the client secret to exchange a code
for a token. A secret in browser JavaScript is not a secret. There is no way to
complete this flow client-side, and pretending otherwise would ship a security hole.

**Consequences.**
- Real login requires deploying one function. `pipeline/PIPELINE.md` has a
  copy-paste Vercel implementation.
- Demo mode issues a local session with no network calls, so evaluation and CI never
  touch OAuth.

**Revisit if.** Moving to a platform with a built-in auth broker, or adopting a
device-flow-capable provider.

---

## 7. Design audit over Playwright

**Decision.** Drive Chromium directly over the DevTools Protocol using Node's
built-in `WebSocket`. Provision a browser into `.cache/chromium/` via
`@sparticuz/chromium` when none is present.

**Why.** Playwright is ~300MB plus its own browser download, and in this build
environment that download was blocked outright. CDP is a JSON-over-WebSocket
protocol; the subset needed here — navigate, evaluate, screenshot, listen for
console errors — is about 250 lines. It also keeps decision 2 intact.

**Consequences.**
- `scripts/lib/cdp.js` is ours to maintain. It handles roughly 5% of what
  Playwright does.
- Auto-download only works on Linux. Elsewhere the resolver falls back to a system
  Chrome, or `CHROMIUM_PATH`.
- One subtlety had to be handled by hand: same-document navigation (a URL differing
  only by `#hash`) fires no load event, so a naive wait burns the full timeout. This
  cost 30s per view before it was found.

**Revisit if.** The audit needs deep browser automation — multi-tab coordination,
network interception, video capture. At that point Playwright earns its weight.

---

## 8. Audit findings group by root cause

**Decision.** Findings carry an optional `groupKey`. The report collapses matching
findings into one entry with an occurrence count and examples.

**Why.** The first audit run reported 62 contrast findings. They were one CSS
variable. A brief listing 62 tasks is unusable by a human *or* an agent — it buries
three real fixes in noise and invites fixing symptoms element by element.

**Consequences.**
- `FIXME.md` lists fixes, not symptoms. 62 findings became 3 tasks.
- Rules that can repeat across elements should set a `groupKey`. Rules reporting a
  genuinely unique defect can omit it.

---

## 9. Fix the UI, never weaken the rule

**Decision.** Stated as a guardrail in `CLAUDE.md` and repeated in the prompt that
`design-fix.js` sends to Claude Code: do not edit `design-rules.js` to make a
finding disappear.

**Why.** The fastest way to make an audit pass is to delete the rule that fails.
Any agent optimizing for a green check will find that path. The instruction has to
be explicit and repeated where the agent will encounter it.

**Consequences.** Adding a rule is still legitimate — when a *new class* of bug
appears, it belongs in `design-rules.js` with a comment naming the real defect it
caught, plus an entry in `RULE_GUIDANCE`.

---

## 10. Screenshots committed to Git

**Decision.** Keep ~2.2MB of PNGs in `docs/screenshots/`, referenced from the
README. The audit's own screenshots go to the gitignored `design-report/screens/`.

**Why.** A README that shows the product is worth more than a marginally smaller
repository. The committed set is a curated snapshot; the audit set is disposable
build output.

**Consequences.**
- They go stale on UI changes unless refreshed deliberately.
- Regenerating them repeatedly would bloat history, since PNGs do not delta-compress.

**Revisit if.** History size becomes a real problem, or the UI churns fast enough
that stale screenshots mislead. Dropping them costs nothing — the audit regenerates
equivalents on demand.

---

## 11. CI as a template, not an active workflow

**Decision.** `docs/ci/design-audit.yml.example`, with two activation commands in
the README.

**Why.** Not a design choice — a permissions constraint. GitHub rejects workflow
files pushed by an App lacking `workflows` permission. Shipping the file where it
cannot be pushed would have failed the push entirely.

**Revisit.** Immediately, if you want CI. Copy it into `.github/workflows/` and
commit from an account with the permission.
