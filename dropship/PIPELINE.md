# DROPSHIP PIPELINE

> Trend research → scored candidates → product brief → landing page → sales
> content → audit. Turns a spotted trend into a sellable asset without
> inventing anything along the way.

```
 RESEARCH          BRIEF               PAGE              CONTENT           GATE
 _candidates.json  products/*.json     build-page.mjs    content-kit.mjs   audit.mjs
 research.mjs  →   scaffold        →   out/*.html    →   out/*-kit.md  →   pass/fail
                                                         render.mjs → mp4
```

Every stage is a command. Nothing here is a plan.

```bash
npm run research                              # score and rank candidates
node dropship/research.mjs scaffold dropship/products/_candidates.json <id>
npm run page  dropship/products/<slug>.json   # brief -> landing page
npm run kit   dropship/products/<slug>.json   # brief -> hooks, scripts, ad copy
npm run clips dropship/out/<slug>.html        # page -> vertical MP4s
npm run audit                                 # gate: integrity, conversion, quality
npm test                                      # 83 tests
npm run verify                                # tests + audit
```

---

## 1 · Research — `research.mjs`

The agent gathers raw signal (web search, browser automation) into
`products/_candidates.json`. The tool is the deterministic half: it applies the
gates identically to every candidate, explains each rejection, and ranks what
survives.

**The gates**, from live 2026 market research:

| Gate | Threshold | Why | Weight |
| --- | --- | --- | --- |
| **Margin** | ≥ 3× landed cost | Below this, paid acquisition eats the business | 30 · **hard veto** |
| **Demoable in 3s** | required | Short-form gives one beat; if it needs explaining it will not sell | 25 · **hard veto** |
| **Momentum** | ≥ 60/100 | Rising, not peaked — a peaked trend means competing with every ad budget at once | 20 |
| **Price band** | $20–40 | The impulse zone. Below it margins die; above it people deliberate | 15 |
| **Real problem** | required | Novelty spikes and dies; problems recur | 10 |

Hard vetoes reject outright regardless of total score. Verdicts: **GO** (≥70,
no veto) · **WATCH** (≥50) · **PASS** · **REJECT**.

Real output from the shipped candidate set:

```
GO    100%  Scalp Relief Brush  (4.91x)
WATCH  65%  Magnetic Cable Tidy  (5x)
        momentum 55 < 60; price $14 outside $20-40
REJECT  70%  Rotating Spice Carousel  (2.25x)
        margin 2.25x < 3x
```

The spice rack scored 70% and still failed — its margin cannot survive ads.
That is the scoring doing work an eyeball would not.

`scaffold` converts a winner into a brief with unverified fields left `null` and
a `_status` banner, so nothing gets quietly assumed.

## 2 · Brief — `products/<slug>.json`

Single source of truth. The page, the content kit, and the ad copy all derive
from it; nothing is written twice.

### Truth rules — enforced in code, not left to discipline

Validation lives in `lib/schema.mjs` and blocks generation on error:

- **No rating without quotes.** Set a rating with no sourced review and the
  build refuses. Fabricated testimonials are illegal in the US (FTC) and are the
  fastest route to losing a payment processor.
- **No deceptive compare-at price.** A struck-through price that is not actually
  higher is an error.
- **No regulated claims** — `cure`, `heals`, `clinically proven`, `FDA-approved`,
  `guaranteed results`. Judged per sentence, so the standard *"not intended to
  diagnose, treat, cure, or prevent"* disclaimer is correctly allowed.
- **No manufactured urgency** — `only N left`, `N people viewing`, `act now`.
  There is no code path that renders them.
- **Null is omitted, never filled.** An empty field disappears from the page.
- **Shipping prints verbatim.** Nothing promises faster than the supplier ships.

Warnings (non-blocking) cover: sub-3× margin, out-of-band price, unscored
momentum, unsourced trend, missing disclaimer on beauty/wellness, placeholder
checkout URL, empty shipping estimate.

## 3 · Page — `build-page.mjs`

One self-contained HTML file. No external requests, no frameworks, no tracking
pixels.

Announcement bar → hero (image, price, compare-at, savings badge, CTA, trust
row) → problem/agitation/solution → how it works → benefits → gallery → specs →
reviews *(only when real)* → FAQ → guarantee + closing CTA → footer with
disclaimers. A **sticky buy bar** appears once the hero CTA scrolls away.

**Accessible accent derivation.** A brand accent picked for buttons usually
fails WCAG AA when reused as text on the dark closing section. Rather than ship
a failure or hard-code a second colour, `accessibleOn()` lightens the accent in
small steps — preserving hue — until it clears 4.5:1. Works for any accent.

Where no product photo exists it generates neutral abstract art rather than
stock photography implying a look the product cannot back up.

## 4 · Content — `content-kit.mjs` + `content/render.mjs`

`content-kit.mjs` emits a markdown kit from the brief: **7 hook angles**, **3
shootable scripts** with beat timings and shot direction, **4 ad-copy variants**,
headline tests, captions with category hashtags, and a DM/objection script.

Angles whose source field is empty are **listed as skipped**, never filled with
a plausible guess. Missing data surfaces as `[FILL shipping.estimate — do not
guess]` rather than an invented number.

`content/render.mjs` renders the page to vertical 1080×1920 H.264. Shots declare
a `needs` selector and a `role`; the engine probes the page, drops shots whose
target is absent, and dedupes by role preferring page-specific over generic. A
product page yields hero, scroll, reduced-motion, and CTA clips; the Lumen
showcase yields eight.

**The agent never uploads.** Clips are produced and handed over. Instagram
uploads are prohibited outright.

## 5 · Audit — `audit.mjs`

The gate before anything gets traffic. Renders in real Chromium at 1440px and
390px and inspects the live DOM.

| Family | Rules |
| --- | --- |
| **Integrity** | fake urgency · regulated claims · unsourced rating · countdown elements |
| **Conversion** | no CTA · dead CTA · no price · buried CTA · no guarantee · no shipping |
| **Quality** | contrast (AA, grouped by colour pair) · horizontal overflow · missing alt · sub-44px tap targets · console errors |

Integrity failures always block. **Fix the page; never relax a rule to clear a
finding.**

It works. On first run against the generated example it found a genuine WCAG
failure — accent text at 3.63:1 on the dark section — which produced the
`accessibleOn()` fix above.

## 6 · Tests — `npm test`

83 tests, zero runtime dependencies.

- **Schema** — required fields, kebab slugs, deceptive compare-at pricing,
  rating-without-quotes, every regulated claim and urgency pattern, margin and
  band maths, disclaimer negation.
- **Research** — scoring, hard vetoes, unknown-field handling, ranking order,
  weights summing to 100, scaffold carrying no invented proof.
- **Content kit** — generation counts, skipped-angle reporting, no fabricated
  testimonials, do-not-use rules carried into the kit.
- **Page** — document structure, review omission, HTML escaping (XSS), savings
  maths, no external requests, no timer scripts, reduced-motion path, section
  omission.
- **Audit** — every rule proven by injecting the violation it targets, plus
  proof the FTC disclaimer does *not* trip the claim rule, and that 20 identical
  contrast failures collapse to one finding.
- **Repo invariants** — runtime dependencies stay at zero; the shipped example
  brief validates and claims no unverified supplier data.

## 7 · What is not automated

Honest boundaries:

- **AliExpress has no connector here.** Supplier cost, rating, units sold and
  ship time are entered by hand from the real listing. The dropship API needs
  approval; scraping is fragile and against their terms.
- **No live platform trend APIs.** TikTok and YouTube are not connected.
  Research runs on web search, which indexes trend *coverage* rather than raw
  platform data — directionally useful, coarser than a paid trend tool.
- **No storefront.** Checkout, payments, inventory and fulfilment do not exist.
  The CTA points at whatever URL the brief supplies; until that is real, the
  audit warns that the page cannot take an order.
- **Nothing here spends money or places an order.**

## Files

| Path | Role |
| --- | --- |
| `lib/schema.mjs` | Brief validation + market gates |
| `research.mjs` | Score, rank, scaffold |
| `build-page.mjs` | Brief → landing page (+ contrast helpers) |
| `content-kit.mjs` | Brief → hooks, scripts, ad copy, captions, DM script |
| `audit.mjs` | Integrity / conversion / quality gate |
| `products/_TEMPLATE.json` | Brief schema |
| `products/_candidates.json` | Research worksheet |
| `products/scalp-massager.json` | Worked example — trend data real, supplier null |
| `out/` | Generated pages, kits, clips (gitignored) |
