# Command Center — Director Layer Protocol

How humans and director models drive Scorpion. `PIPELINE.md` covers how the machine works;
this covers who decides what.

---

## 1. Chain of command

| Layer | Who | Owns |
|---|---|---|
| **Operator** | Human | Money, legal risk, final kill decisions |
| **Director** | Claude | Objectives, product go/no-go, creative direction |
| **Co-Director** | ChatGPT | Adversarial review, unit economics, red-teaming the Director |
| **Specialists** | Arena.ai roster | Narrow, well-defined tasks with structured output |
| **Agents** | Fable 5, RunwayML | Live web actions and rendering. Metered |

The Director proposes. The Co-Director challenges. The Operator approves anything that
spends money or creates legal exposure. Specialists never decide strategy — they answer
one question and return JSON.

---

## 2. Current objective

> **First product cycle.** Select a product, source it on AliExpress, create the listing,
> generate content, drive sales. Target **$5–10k in 30 days**. Dropshipping. **Zero ad spend.**

### Budget

| Resource | Allocated | Notes |
|---|---|---|
| Claude credits | $18 | Director reasoning. Do not burn on bulk generation |
| Cash reserve | $40–50 | Samples, domain, first inventory float |
| RunwayML | 125 credits | ~1 hero clip at 15s. Prefer real footage |
| Fable 5 | $12 cap | Live web only when model knowledge cannot answer |
| Ad spend | **$0** | Hard constraint. Organic short-form only |

Zero ad spend is the binding constraint on everything else. It means the product must be
*inherently* filmable — if the demo isn't compelling in the first three seconds with no
paid distribution, the product is wrong regardless of margin.

---

## 3. Product selection criteria

A candidate ships only if it clears **all five**:

1. **Visually demonstrable** — transformation, reveal, or satisfying demo in one unbroken shot
2. **3x+ margin** — $5 landed cost → $15+ sale price, minimum
3. **Trending now** — verifiable current momentum on TikTok or Reels, not last year's winner
4. **Impulse trigger under 3 seconds** — the viewer understands the value before they can scroll
5. **Not saturated** — fewer than ~10 accounts pushing it heavily

`scout.scoreCandidate()` encodes this as a 0–100 score:

| Component | Max | Basis |
|---|---|---|
| Margin | 35 | Linear above 50% |
| Trend momentum | 25 | rising 25 / peaking 18 / flat 8 / cooling 2 |
| Saturation | 25 | low 25 / medium 14 / high 3 |
| Visual demo | 10 | Boolean |
| Shipping ≤14 days | 5 | Boolean |

**Thresholds:** ≥75 proceed to sourcing · 55–74 hold for a second signal · <55 reject.

---

## 4. Product lifecycle

```
researching → sourcing → active → winning
      ↓           ↓         ↓
     dead        dead      dead
```

| Stage | Meaning | Exit criteria |
|---|---|---|
| `researching` | Scored, not yet sourced | Supplier verified at target cost → `sourcing` |
| `sourcing` | Supplier confirmed, listing being built | First sale → `active` |
| `active` | Live, selling, unproven | 20+ units at target margin → `winning` |
| `winning` | Proven. Gets content budget priority | Sustained decline → `active` or `dead` |
| `dead` | Killed. Never re-enters the funnel automatically | — |

### Kill criteria

Kill a product when **any** holds:

- Refund rate above 12%
- Fewer than 5 units in 14 days while `active`
- Margin compressed below 60% by competitor pricing
- Supplier rating drops below 4.3 or ship window exceeds 21 days
- Three consecutive clips under 5k views

Dead products are permanently excluded by `scout.runCycle()` — it checks the dead list
before proposing candidates, so the system cannot rediscover its own failures.

---

## 5. Content protocol

**Volume beats polish.** With zero ad spend, distribution is entirely a function of
attempts. Three clips per product minimum, posted across TikTok, Reels and Shorts.

Every clip follows the three-beat structure enforced by `studio.buildScript()`:

| Beat | Window | Job |
|---|---|---|
| 1 | 0–3s | The hook. Problem state or provocative claim. No branding, no logo, no intro |
| 2 | 3–10s | The proof. One continuous action. Cuts kill credibility here |
| 3 | 10–15s | The payoff. Result plus a soft CTA |

### Hook rules

- Under 12 words
- No product name in the hook — sell the outcome
- Specificity converts: "$600 quote" beats "expensive"
- Second person. "Your grout," not "this grout"

### Rejection criteria

A hook is rejected if it needs more than three seconds to make sense, names the product,
sounds like an ad, or could describe any product in the category.

---

## 6. Escalation rules

**When to spend Fable 5 budget:**

- Verifying a live AliExpress price before committing inventory float — yes
- Checking a seller's current rating and ship window — yes
- Counting competitor storefronts for a saturation call — yes
- General "what's trending" research — **no**, that's Perplexity's job at 1/80th the cost

**When to spend RunwayML credits:**

- B-roll you physically cannot film — yes
- Establishing shots for a product not yet in hand — yes
- Anything you could shoot on a phone in 10 minutes — **no**

**When to escalate to the Operator:**

- Any cash outlay above $25
- Any health, medical, or safety claim in copy
- Any supplier requiring payment outside AliExpress escrow
- Refund rate crossing 10% on an active product

---

## 7. Reporting cadence

| Report | Frequency | Produced by | Lands in |
|---|---|---|---|
| Product Scout Report | Per scout cycle | `scout.toMarkdown()` | `pipeline/product-scout-report-N.md` |
| Revenue snapshot | Daily | `tracker.window()` | Dashboard |
| Content performance | Per clip, 48h after posting | Manual metrics entry | `data/content.json` |
| Kill review | Weekly | Director + Co-Director | Stage transitions |

### Scout report format

Every scout report uses exactly this structure so the Director can diff cycles:

```markdown
# Product Scout Report #N
Date: [ISO]
Generated by: Arena.ai + Fable 5

## Product 1: [Name]
- AliExpress Link: [URL]
- Cost: $X | Sale Price: $Y | Margin: Z%
- Trend Source: [hashtag or category]
- Content Angles: [3 hooks]
- Saturation Score: [Low/Med/High — with evidence]
- Risk: [decay, shipping, returns]

## Recommendation
Top pick with rationale.
```

---

## 8. Structured output discipline

Specialists return **JSON or Markdown only**. No preamble, no "Certainly!", no explanation
of what they're about to do. Every system prompt in `arena-router.js` states the exact
shape expected, and `parseJson()` strips code fences before parsing.

If a model returns prose where JSON was requested, that's a routing failure — either the
prompt is underspecified or the model is wrong for the task. Fix the route, don't
post-process the prose.

---

## 9. Standing constraints

1. **Zero ad spend.** Not "low." Zero. Organic distribution only.
2. **No health claims.** No product treats, cures, or prevents anything.
3. **Escrow only.** AliExpress payment protection on every order, no exceptions.
4. **Ship windows disclosed.** The delivery estimate goes on the product page, above the fold.
5. **One product at a time gets full content budget.** Splitting attention across five
   products with zero ad spend produces five failures.
