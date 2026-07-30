# DROPSHIP PIPELINE

> Trend research → product brief → landing page → sales content.
> Turns a spotted trend into a sellable asset without inventing anything.

```
  RESEARCH            BRIEF                 PAGE                  CONTENT
  web search    →   products/<slug>.json  →  build-page.mjs   →  content/render.mjs
  (agent-run)       (the single source)      out/<slug>.html     out/*.mp4
```

## 1 · Research

Run by the agent using web search + browser automation. Output goes into the
brief's `trend` block — signal, source URLs, momentum, date checked.

**Validation criteria** (from live 2026 market research, sources in the example brief):

| Test | Why |
| --- | --- |
| **Demonstrable in under 3 seconds** | Short-form gives you one beat. If the value needs explaining, it won't sell on video. |
| **Solves a tangible problem** | Novelty spikes and dies; problems recur. |
| **$20–40 sell price** | The impulse band. Below it margins die on ad spend; above it people deliberate. |
| **3×+ on landed cost** | Supplier + shipping × 3 minimum, or ads eat the business. |
| **Rising, not peaked** | Entering a peaked trend means competing with everyone's ad budget at once. |

Kill a candidate that fails any of the first four.

## 2 · Brief

Copy `products/_TEMPLATE.json` → `products/<slug>.json` and fill it. This file is
the single source of truth: the page, the content, and the ad copy all derive
from it. Nothing gets written twice.

**Truth rules — enforced by the generator, not left to discipline:**

- **No invented reviews or ratings.** The review section is omitted entirely
  until real quotes exist. Fabricated testimonials are illegal in the US (FTC)
  and are the fastest way to lose a payment processor.
- **No countdown timers, fake stock counters, or "N people viewing."** The
  generator has no code path that emits them.
- **Shipping is printed as written.** Never promise 2-day on a 14-day supplier.
- **Null is omitted, never filled.** An empty field disappears from the page
  instead of being invented.
- **No medical claims** on beauty/wellness items. Disclaimers go in `legal`.

## 3 · Page

```bash
node dropship/build-page.mjs dropship/products/<slug>.json
```

Emits one self-contained HTML file — no external requests, no frameworks, no
tracking pixels baked in.

Structure: announcement bar → hero (image, price, compare-at, CTA, trust row) →
problem/agitation/solution → how it works → benefits → gallery → specs →
reviews *(only if real)* → FAQ → guarantee + closing CTA → footer with
disclaimers. Plus a **sticky buy bar** that appears once the hero CTA scrolls
off.

Where no product photo exists, it generates neutral abstract art rather than
stock photography that implies a look the product can't back up. Replace with
real supplier images before running traffic.

The script prints warnings: missing reviews, missing price, and the actual
margin multiple on landed cost.

## 4 · Content

```bash
node content/render.mjs dropship/out/<slug>.html dropship/out/clips
```

The same engine that renders site clips retargets to a product page — vertical
1080×1920 H.264, ready to post.

**The agent never uploads.** Clips are produced and handed over; publishing is
Juan's call. Instagram uploads are prohibited outright.

## 5 · What is not automated

Honest boundaries — these need a human or a connection we don't have:

- **AliExpress has no connector here.** Supplier cost, rating, units sold, and
  ship time are entered by hand from the real listing. The affiliate/dropship
  API needs approval; scraping is fragile and against their terms.
- **No live platform trend APIs.** TikTok and YouTube are not connected.
  Research runs on web search, which indexes trend coverage rather than raw
  platform data — directionally useful, coarser than a paid trend tool.
- **No storefront.** Checkout, payments, inventory, and fulfilment are not
  built. The page's CTA points at whatever URL you supply.
- **Nothing here spends money or places orders.**

## Files

| Path | Role |
| --- | --- |
| `products/_TEMPLATE.json` | Brief schema — copy per product |
| `products/scalp-massager.json` | Worked example. Trend data real; supplier/reviews null and marked |
| `build-page.mjs` | Brief → landing page |
| `out/` | Generated pages and clips (gitignored) |
