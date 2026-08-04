# 08 — Execution Flows

How a request moves through the system: which capabilities execute, in what order, what each receives, what each returns, and how the Orchestrator combines it all.

---

## Flow 1 — "I need 30 Instagram Reels this month"

### Entry

```http
POST /v1/requests
{ "clientId": "c_8f2a", "request": "I need 30 Instagram Reels this month",
  "constraints": { "deadline": "2026-09-01", "budgetUsd": 60 } }
```

**Orchestrator, before any task exists:**

1. Resolve tenant + client from the session; set `app.tenant_id` on the connection.
2. Match intent → `content.reels.monthly@2.1.0`. Exact match, so **no LLM planning runs**.
3. Load profile memory: brand guidelines, tone, USP, avatars, license number, brokerage.
4. Estimate: 543 tasks, ~$38.40. Under the $60 budget → proceed. (Over → `402` with the estimate, no work started.)
5. Persist `job` + all stage-A `task` rows. Return `202` with a `jobId` in ~80ms.

The client's connection is now free. Everything below happens on workers.

---

### Stage A — Strategy · 3 tasks, sequential

Runs **once** for all 30 reels. This is the leverage point: three tasks decide what 540 downstream tasks will be about.

| # | Capability | Receives | Returns |
|---|---|---|---|
| A1 | `strategy.content` | request; memory: `brand.guidelines`, `brand.tone`, `intake.usp`, `intake.avatar`, `content.winning_hooks` (top 20 by score) | 30 content pillars/themes with angle + target avatar |
| A2 | `strategy.trend-analyst` | client markets; **tool:** trends API, IG platform API | rising audio, formats, and topics for the niche |
| A3 | `strategy.platform` | A1 output + A2 output | per-reel format constraints: 9:16, 20–45s, hook ≤ 3s, caption ≤ 2,200 chars |

**Orchestrator merge — `compose`:**

```json
ReelBrief[30] = [{
  "briefId": "reel-1",
  "theme": "Why 'priced to sell' is costing sellers 4%",
  "angle": "contrarian-stat",
  "avatar": "Move-Up Seller (Dana)",
  "trendHooks": ["audio:xyz", "format:talking-head-broll"],
  "constraints": { "ratio": "9:16", "durationSec": [20,45], "hookMaxSec": 3 }
}, ...]
```

Merge asserts `count == request.quantity`. 30 briefs → 30 persisted branches, each with an independent budget slice of `$60/30 = $2.00`.

> **Failure at this stage is cheap and must be caught here.** If A1 returns 24 briefs, the merge fails its `expect` and retries A1 once. Discovering the shortfall after 400 downstream tasks have run would waste roughly $30.

---

### Stage B — Writing · 6 tasks × 30 reels = 180 tasks

Fan-out across reels (concurrency 8), **sequential within a reel** — each writer consumes the previous one's output.

| # | Capability | Receives | Returns |
|---|---|---|---|
| B1 | `writing.hook-writer` | `ReelBrief`; memory: `brand.tone`, `content.winning_hooks`, `content.rejected_ideas` | 10 ranked hooks, ≤12 words, ≥4 archetypes |
| B2 | `writing.script-writer` | brief + B1's top hook | 20–45s spoken script, timestamped beats |
| B3 | `writing.cta-writer` | B2 + campaign funnel stage | CTA line + on-screen text |
| B4 | `writing.caption-writer` | B2 + B3 | IG caption ≤2,200 chars |
| B5 | `writing.hashtag-generator` | brief + `strategy.platform` constraints | 15 hashtags, mixed reach tiers |
| B6 | `creative.video-prompt-engineer` | B2 | generation prompts per script beat |

**What B1 does *not* receive:** the workflow, the other 29 briefs, the client's full content history, or any credential. It gets one brief and ~2 KB of scoped memory. That isolation is why it is independently testable — and why it is replaceable.

B5 runs in parallel with B2–B4 (it depends only on the brief), which the DAG expresses naturally.

Merge — `collect`: `DraftReel[30]`.

---

### Stage C — Video production · 4 tasks × 30 = 120 tasks

| # | Capability | Receives | Returns |
|---|---|---|---|
| C1 | `video.shot-planner` | B2 script | numbered shot list with intent per shot |
| C2 | `video.storyboard` | C1 | framing + composition per shot |
| C3 | `video.broll-planner` | C1 | B-roll spec + sourcing instructions per shot |
| C4 | `video.subtitle` | B2 script; **tool:** ASR | time-aligned caption track |

Output: a complete production package per reel — everything a human editor or a generation pipeline needs, with no ambiguity about intent.

---

### Stage D — QA gate · 5 tasks × 30 = 150 tasks · **fail-closed**

D1–D4 run in parallel; D5 aggregates.

| # | Capability | Checks | Blocking? |
|---|---|---|---|
| D1 | `qa.fact-checker` | prices, dates, market statistics *(tool: web search + metric query)* | yes |
| D2 | `qa.grammar` | grammar, spelling, readability | warn only |
| D3 | `qa.brand` | voice, tone, vocabulary, forbidden words | yes |
| D4 | `qa.compliance` | **Fair Housing language · license number + brokerage attribution · required disclosures · asset usage rights** | **yes, non-bypassable** |
| D5 | `qa.final-approval` | aggregates D1–D4 via `worst_verdict` | emits the release decision |

`worst_verdict` means one `fail` among four passes still blocks. No averaging, no majority vote.

**The repair loop, concretely.** Reel #17: `qa.compliance` fails — the script says "perfect for young families," which is familial-status steering under the Fair Housing Act.

```
D4(reel-17) → fail: fair_housing.familial_status
  → orchestrator routes the verdict to the OWNING capability (writing.script-writer),
    with the verdict text appended to its input
  → B2(reel-17) re-runs → B3, B4 re-run downstream
  → Stage D re-runs for reel-17 only  (29 other reels are untouched and still advancing)
  → pass → continue
  → still failing after 2 cycles → status: needs_human → appears in the console exception queue
```

Note what does *not* happen: the orchestrator does not retry `qa.compliance` hoping for a different verdict, and it does not lower the bar. It routes the failure to whoever can fix it, twice, then asks a person.

---

### Stage E — Client approval · human

30 packages surface in the portal Review screen. Each outcome writes to memory:

| Action | Memory write | Why it matters |
|---|---|---|
| Approve | `content_items.status = approved` | becomes retrievable as a positive example |
| Reject | `status = rejected` + `rejected_reason` | **feeds `content.rejected_ideas`** — never proposed again |
| Revise | edit diff → episodic tier | highest-signal training data the system produces |

Seven-day timeout → escalate to `exec.client-success`.

---

### Stage F — Publish · 3 tasks × 30 = 90 tasks · connectors only

| # | Capability | Kind | Action |
|---|---|---|---|
| F1 | `publishing.formatter` | C | build the exact IG payload |
| F2 | `publishing.scheduler` | C | resolve the publish datetime from cadence + timezone |
| F3 | `publishing.instagram` | C | upload → create container → publish |

No model call touches this stage. F3 resolves the OAuth token from the secrets service at call time; it is never in memory, a prompt, or a log.

The `publications` row cannot be inserted without `compliance_verdict_id` (NOT NULL foreign key) — so even an orchestrator bug cannot publish uncleared content. Compensation on downstream failure: `publishing.instagram.delete`.

---

### Stage G — Measurement · 3 scheduled tasks × 30 = 90 tasks (deferred)

`analytics.collector` fires at +24h, +7d, +30d per publication, writing to the metric tier. Then the learning loop closes:

```
metrics → analytics.content-reviewer  → "contrarian-stat hooks outperformed by 3.1×"
        → analytics.optimization      → writes to content.winning_hooks with performance
        → next month, B1 retrieves it, weighted 0.3 by that performance score
```

**No prompt was edited.** Output improves because memory improved. This is the compounding mechanism.

---

### What the Orchestrator returns

```json
{
  "jobId": "j_1a4c", "status": "partial",
  "result": { "contentCalendar": { "reels": 27, "period": "2026-08" } },
  "summary": {
    "tasksTotal": 543, "tasksOk": 538, "tasksNeedsHuman": 5,
    "costUsd": 41.20, "durationMs": 486000,
    "costByLayer": { "writing": 18.40, "qa": 11.80, "video": 6.20,
                     "creative": 3.10, "strategy": 1.40, "publishing": 0.30 }
  },
  "needsHuman": [
    { "branch": "reel-17", "capability": "qa.compliance",
      "reason": "fair_housing.familial_status — 2 repair cycles exhausted" }
  ]
}
```

27 delivered, 3 flagged. It does not fail the month over three items, and it does not silently ship 27 while calling it 30.

**The Orchestrator wrote nothing.** It matched a workflow, resolved memory, dispatched 543 tasks, enforced concurrency and budget, ran five merges, routed two repair loops, escalated three items, and assembled the result.

---

### Cost anatomy

| Stage | Tasks | Model tier | Cost | Note |
|---|---|---|---|---|
| A Strategy | 3 | deep | $0.90 | run once — highest leverage per dollar |
| B Writing | 180 | fast | $18.40 | the bulk; cheapest tier |
| C Video | 120 | balanced | $6.20 | |
| D QA | 150 | balanced/deep | $11.80 | compliance runs `deep`; non-negotiable |
| F Publish | 90 | none | $0.30 | connectors — API cost only |
| | **543** | | **$41.20** | ~$1.37 per finished reel |

Two things fall out of this table. Compliance QA is 29% of spend and stays that way — it is the cheapest insurance in the system. And moving `writing.*` from `fast` to `balanced` would roughly triple the largest line item, which is why tier is per-manifest configuration rather than a global setting.

---

## Flow 2 — New client onboarding

Triggered by `POST /v1/clients`. Runs once, deep tier throughout, ~$12 — an investment that every future task amortizes.

```
intake.lead-qualification
        ↓ (qualified)
intake.discovery                      ← call transcript / intake form
        ↓
  ┌─────┴──────┬──────────────┐
  ▼            ▼              ▼
intake.brand-  intake.        intake.offer-analysis
extraction     business-
               research
                 ↓
        intake.competitor-research
                 ↓
        intake.audience-research
                 ↓
  ┌──────────────┴──────────────┐
  ▼                             ▼
intake.avatar-builder      intake.usp-builder
  └──────────────┬──────────────┘
                 ▼
        intake.content-audit  (if prior content exists)
                 ▼
   ═══ writes profile memory ═══
   brand.guidelines · brand.tone · intake.usp · intake.avatar
   · offer · license_number · brokerage
                 ▼
        strategy.marketing → strategy.content → first content calendar
```

Every subsequent request for this client reads that profile. Onboarding is expensive exactly once.

---

## Flow 3 — Weekly performance review (scheduled)

```
cron weekly
  → analytics.collector          (per client, per platform)   [connector]
  → analytics.trend-tracker      trajectory
  → analytics.content-reviewer   per-post retrospective
  → analytics.ab-testing         call any running variant tests
  → analytics.optimization       → WRITES content.winning_hooks
  → analytics.performance-reporter → client-readable narrative
  → automation.notification      → email + portal
```

Fully autonomous, no human in the path, ~$2/client/week. At 500 clients that is $1,000/week — which is why `analytics.collector` is a connector rather than an agent, and why the reporter is the only `deep`-tier call in the flow.

---

## Flow 4 — Unrecognized request (the LLM planning path)

```http
POST /v1/requests
{ "request": "Can you build me a landing page for the Willow Creek listing
              and run ads to it for two weeks?" }
```

No workflow matches, so the one LLM planning path opens:

```
1. exec.delivery-planner receives: request + registry catalog + client profile
2. Returns a proposed DAG:
     websites.planner → websites.designer → websites.copy
       → websites.seo-implementation → websites.accessibility-qa
       → websites.performance-optimizer → websites.deployment
       → writing.ad-copy → creative.graphic-designer
       → qa.compliance → qa.final-approval → [paid campaign]
3. Orchestrator VALIDATES — and this is the whole point:
     ✓ every capabilityId resolves
     ✓ producer/consumer schemas are compatible on every edge
     ✓ acyclic
     ✓ estimated cost within budget
     ✓ every path reaching a publish node passes qa.compliance   ← the critical check
4. Valid → persist as a candidate workflow, execute deterministically
   Invalid → reject, retry planning once, then escalate to a human
```

If the planner omitted `qa.compliance` before the ad-copy publish node, check 5 rejects the plan. **The model cannot route around the compliance gate**, because the gate is enforced by the validator, not by the planner's good judgment.

Successful plans that recur are promoted by an operator into a named workflow definition — after which that request type takes the deterministic path forever and never pays for planning again.

---

## Adversarial walkthroughs

The architecture is only real if it answers these from the documents alone.

### A. Compliance failure at reel #17, mid-fan-out

| | |
|---|---|
| Detection | `qa.compliance` returns `fail: fair_housing.familial_status` |
| Blast radius | **reel-17 only.** Fan-out branches are independent; 29 reels keep advancing |
| Response | Verdict routed to `writing.script-writer` (the owning capability), not retried blindly |
| Bound | 2 repair cycles, then `needs_human` |
| Escape | `exec.operations-manager` picks it up from the console exception queue |
| Can it leak? | No. `publications.compliance_verdict_id` is NOT NULL — the row is uninsertable without a passing verdict |
| Record | Every verdict, pass and fail, persisted to `compliance_verdicts` for audit |
| Cost | The 3 wasted downstream tasks cost ~$0.06. The alternative is a Fair Housing complaint. |

### B. Instagram token expires mid-publish, reel #12 of 30

| | |
|---|---|
| Detection | `publishing.instagram` receives platform error 190 |
| Classification | `AuthError` → **non-retryable** (see the error taxonomy). Retrying an expired token 4 times is 4 guaranteed failures |
| Immediate | Circuit breaker in `automation.api-manager` opens for `instagram:c_8f2a` |
| Reels 13–30 | Park in `waiting_on_provider`, **not** consuming retry budget or failing |
| Reels 1–11 | Already published. Untouched. No compensation runs — they succeeded |
| Escalation | `exec.operations-manager` → `automation.notification` → client is asked to re-authorize |
| Recovery | New token lands in the secrets service → breaker closes → parked tasks resume from their exact state |
| Duplicate risk | None. Each publish task's `idempotencyKey` is unique-constrained, so a resumed task cannot double-post |
| Did an agent see the token? | No. Only the connector resolved it, at call time. The agent runtime role has no grant on the `credentials` table |

Both scenarios resolve without a redesign, without data loss, and without a human touching the database. That is the bar Phase 1 had to clear.
