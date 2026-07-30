# Kickoff — where to take this next

`scorpion.html` is a finished, working file, not a prompt. This page tells you
**who to hand it to** and **what to paste** in each case.

---

## Quick routing

| You want | Give it to | How |
|---|---|---|
| Change code in this repo | **Claude Code** | `cd` into the repo, run `claude`, paste Prompt A |
| Tinker on the single file, no repo | **Battle mode / any chat AI** | Attach or paste `scorpion.html`, then Prompt B |
| Compare model outputs on one change | **Battle mode** | Prompt B, scoped to one narrow task |
| Fix visual bugs found automatically | **Claude Code** | `npm run design:fix` (does the handoff for you) |

**Rule of thumb:** Claude Code when it needs to *read the repo and run tests*.
Battle mode when you want *fast iteration on one screen* and will paste the
result back yourself.

---

## Prompt A — Claude Code, working in this repo

Run `claude` from the repo root and paste:

```
Read CLAUDE.md and docs/PROJECT_STATUS.md first — they cover the
conventions and what is real vs simulated.

This repo has two builds of the same app:
  - Canonical: index.html + assets/ + scripts/ + modules/
  - Single-file: scorpion.html (self-contained, runs from file://)

I'm working on: <YOUR TASK>

Constraints:
- Zero runtime dependencies. No framework, no bundler, no build step.
- Keep `npm test` passing (106 tests).
- Run `npm run design:audit` after UI changes; it must report 0 errors.
- If you change one build, tell me whether the other needs the same change.
```

Replace `<YOUR TASK>` with one specific thing. Good: *"add a Content Calendar
view showing clips by scheduled post date."* Bad: *"make it better."*

---

## Prompt B — Battle mode or any chat AI, single file

Attach `scorpion.html` (or paste it — ~23k tokens, fits most context windows),
then:

```
This is a single-file dashboard app. Everything is inline: CSS, seed
data, logic. It runs by opening it in a browser — no server, no build.

Structure — 14 numbered sections, search the banners to navigate:
  [01] THEME       CSS custom properties
  [04] CONFIG      tunable constants
  [05] SEED DATA   products + clips
  [06] SALES       seeded PRNG order generator
  [07] REGISTRY    model catalog + routing table
  [13] VIEWS       one function per screen, returns an HTML string
  [14] APP         boot, nav, events

Task: <YOUR TASK>

Rules:
- Return the complete modified file, or a precise diff — not a sketch.
- Vanilla JS only. No React, no libraries, no build step.
- It must still run by double-clicking. Nothing that needs a server.
- Use the CSS variables in [01]; don't hardcode colours.
- Adding a screen = one function in VIEWS + one entry in NAV.
```

### Making battle mode useful

Battle mode compares models on the same prompt, so it works best when the task
is **narrow and judgeable**:

- Good: *"redesign the Product Scout cards to show margin more prominently"*
- Good: *"add sortable columns to the orders table"*
- Weak: *"add a whole analytics system"* — too big to compare fairly

Paste the winning output back into `scorpion.html`, open it, and confirm it
still works before moving on.

---

## Prompt C — automated visual QA, then fix

The repo can find its own UI bugs and write the brief:

```bash
npm run design:audit   # renders every view in real Chromium
npm run design:fix     # audit → hands the brief to Claude Code → re-audits
```

`design:fix` needs the CLI: `npm install -g @anthropic-ai/claude-code`.

To drive it manually:

```bash
npm run design:audit
claude "read design-report/FIXME.md and fix every task in it"
```

---

## What no AI can do for you

These need a human with an account and a card:

- Ordering a product sample
- Opening the Shopify or TikTok Shop storefront
- Paying a supplier (AliExpress escrow only)
- Obtaining `ARENA_API_KEY`, `FABLE_API_KEY`, `RUNWAY_API_KEY`
- Deploying the OAuth token-exchange endpoint

Until those keys exist, every AI call in the app returns a simulated response.
That is by design — see `docs/DECISIONS.md` entry 4.

---

## Before you hand anything off

```bash
npm run verify   # 106 tests + design audit
```

Both green means the baseline is sound and any breakage came from the change,
not from something already broken.
