# 03 — The Orchestrator

> **Rule 2.** The Orchestrator never performs work. It receives requests, breaks work into subtasks, selects agents, passes context, tracks progress, retries failures, merges completed work, and returns the final result. It is a project manager. Nothing else.

## How Rule 2 is enforced

Not by discipline — by dependency boundary. The `packages/orchestrator` package declares **no dependency on the LLM client, no dependency on any prompt, and no dependency on `packages/runtime`**. A boundary test in CI asserts this. The orchestrator physically cannot call a model.

```
packages/orchestrator
  ├── depends on: contracts, registry (metadata only), memory (scope resolution),
  │               queue, observability
  └── FORBIDDEN:  llm-client, runtime, any agents/** path
```

Everything the orchestrator "decides" is a lookup or a graph operation.

---

## The one exception, and its leash

A request that matches no known workflow needs a plan, and planning genuinely requires judgment. That judgment is delegated to a capability — `exec.delivery-planner` — invoked exactly like any other, through the queue, through the runtime, at arm's length.

The orchestrator does not trust its output:

```
1. exec.delivery-planner returns a proposed DAG
2. Orchestrator validates it:
     · every capabilityId resolves in the registry
     · every edge's producer output schema satisfies the consumer input schema
     · the graph is acyclic
     · total estimated cost ≤ the client's remaining budget
     · every path that reaches a publish node passes through qa.compliance
3. Any check fails → reject the plan, retry planning once, then escalate to a human
4. Plan accepted → persist it as a workflow definition, then execute deterministically
```

The model proposes. The schema disposes. A planner that hallucinates `writing.hook-writer-v2` or routes around compliance gets rejected before a single task is dispatched.

---

## Workflow definitions

Workflows are declarative files, not code (Rule 5).

```yaml
# agency/packages/workflows/definitions/content.reels.monthly.yaml
id: content.reels.monthly
version: 2.1.0
inputs:
  quantity:  { type: integer, minimum: 1, maximum: 100 }
  platform:  { const: instagram }

stages:
  - id: strategy
    mode: sequential
    tasks:
      - { capability: strategy.content,       input: { from: request } }
      - { capability: strategy.trend-analyst, input: { from: request } }
      - { capability: strategy.platform,      input: { from: strategy.content } }
    merge:
      strategy: compose
      into: ReelBrief[]
      expect: { count: { from: request.quantity } }

  - id: production
    mode: fanout                       # one branch per ReelBrief
    over: strategy.output
    concurrency: { perJob: 8, perTenant: 20 }
    branch:
      - { capability: writing.hook-writer,   input: { from: item } }
      - { capability: writing.script-writer, input: { from: writing.hook-writer } }
      - { capability: writing.cta-writer,    input: { from: writing.script-writer } }
      - { capability: writing.caption-writer, input: { from: writing.script-writer } }
      - { capability: writing.hashtag-generator, input: { from: item } }
      - { capability: creative.video-prompt-engineer, input: { from: writing.script-writer } }

  - id: qa
    mode: fanout
    over: production.output
    gate: true                         # fail-closed: no downstream stage runs without a pass
    branch:
      - { capability: qa.fact-checker }
      - { capability: qa.grammar }
      - { capability: qa.brand }
      - { capability: qa.compliance, bypassable: false }
      - { capability: qa.final-approval, input: { from: [qa.*] } }
    onFail:
      strategy: repair
      maxRepairCycles: 2
      routeTo: { from: verdict.owningCapability }
      thenEscalate: exec.operations-manager

  - id: approval
    mode: human
    surface: client-portal
    timeout: P7D
    onTimeout: escalate

  - id: publish
    mode: fanout
    over: approval.approved
    branch:
      - { capability: publishing.formatter }
      - { capability: publishing.scheduler }
      - { capability: publishing.instagram }
    compensation:                       # what to undo if a later step fails
      - { capability: publishing.instagram, action: delete }

  - id: measure
    mode: scheduled
    at: [PT24H, P7D, P30D]
    tasks:
      - { capability: analytics.collector }
```

`bypassable: false` on `qa.compliance` is structural: a validator rejects any workflow in which a publish node is reachable without traversing a non-bypassable compliance gate. There is no configuration that turns it off.

---

## Execution model

A workflow run is a **job**; each node is a **task**. Both are database rows, so state survives every process restart. The orchestrator holds no state in memory.

```
Request → Job (persisted) → Tasks (persisted) → Queue → Workers → Results (persisted)
                  ▲                                                      │
                  └──────────────── state transitions ───────────────────┘
```

**The scheduler loop** — the whole of the orchestrator's runtime behavior:

```
every tick (and on every task completion event):
  1. find tasks whose dependencies are all `ok` and which are `pending`
  2. check tenant concurrency caps and remaining job budget
  3. resolve memory scopes → build TaskEnvelope
  4. enqueue on the capability's layer queue with the job's priority
  5. on completion: persist result, evaluate successConditions, apply memory writes
  6. on failure: consult the error taxonomy → retry | fail | escalate
  7. when a stage's tasks are terminal: run the stage merge, advance
  8. when all stages are terminal: merge the job, return
```

It is a loop over a graph and a table. That is deliberate — it is auditable, replayable, and testable without a model.

---

## Context passing

The orchestrator decides what each capability sees, and the answer is *the minimum*. Three sources, no others:

1. **Explicit edges.** `input: { from: writing.hook-writer }` copies that task's validated output. Cross-checked at validation time: producer output schema must satisfy consumer input schema, or the workflow fails to load.
2. **Memory scopes.** Read from the manifest's `memory.read`, resolved by the memory service, delivered as an immutable snapshot.
3. **Request constants.** Deadline, locale, budget, client and tenant ids.

Never passed: the workflow definition, sibling task outputs not named on an edge, other clients' data, credentials. A capability cannot discover the shape of the system it runs inside — which is precisely why it can be replaced.

---

## Retry and error recovery

Retry class comes from the error taxonomy in [02-agent-contract.md](02-agent-contract.md); the orchestrator never guesses.

```
attempt 1 → fail (retryable) → wait 2s  ± jitter
attempt 2 → fail (retryable) → wait 8s  ± jitter
attempt 3 → fail (retryable) → wait 32s ± jitter
attempt 4 → terminal → DLQ + escalate to exec.operations-manager
```

Jitter is mandatory: 30 parallel reel branches failing on the same provider 429 would otherwise retry in lockstep and re-trigger the limit.

**The repair loop** is the interesting case, and it is bounded. When a QA gate fails, the orchestrator does not blindly retry the QA task — it routes the verdict back to the capability that produced the offending artifact, with the verdict appended as context:

```
qa.brand fails on reel #17 ("tone too casual for luxury segment")
  → route to writing.script-writer with the verdict attached
  → re-run the QA stage for reel #17 only
  → still failing after 2 cycles → status needs_human → surfaces in the console
```

Two cycles, then a human. An unbounded self-correction loop burns budget and rarely converges.

**Compensation.** Terminal failure after side effects have occurred runs the stage's declared compensations in reverse order — the published post is deleted, the invoice is voided. Compensations are connectors, always idempotent, and their own failures page a human rather than retrying forever.

**Circuit breaking.** Per-provider breakers live in `automation.api-manager`. When Instagram's API is failing broadly, the breaker opens and publish tasks park in a `waiting_on_provider` state instead of consuming retries. Jobs stay alive; the queue does not fill with doomed work.

---

## Merge strategies

Merging is declarative — the orchestrator applies a named strategy, it does not reason about content.

| Strategy | Behavior | Used by |
|---|---|---|
| `compose` | Assemble typed fields from several tasks into one object | strategy stage → `ReelBrief[]` |
| `collect` | Gather fan-out branch results into an array, preserving order | production stage |
| `select` | Choose by a declared rule (`highest_score`, `first_ok`) | hook candidate selection |
| `reduce` | Fold with a named reducer (`sum_costs`, `worst_verdict`) | QA verdict aggregation |
| `passthrough` | Single upstream, forwarded unchanged | linear chains |

`worst_verdict` is why QA gates are safe: five verdicts reduce to the most severe, so one `fail` among four passes still blocks. There is no averaging, and no majority vote.

**Partial success is explicit.** If 27 of 30 reels pass and 3 need human review, the job completes with `status: partial`, returns the 27, and surfaces the 3. It does not fail the month's work over three items — nor does it silently ship 27 and call it 30.

---

## Progress tracking

Every task transition is an append-only row. That single decision buys real-time progress, a full audit trail, cost attribution, replay, and post-hoc debugging with no extra machinery.

```
job.status:  queued → running → partial | completed | failed | cancelled
task.status: pending → ready → dispatched → running
                              → ok | retrying | failed | needs_human | cancelled
```

Progress is a query (`count(ok) / count(*)`), streamed to the portal over SSE. Cost is `sum(usage.costUsd)` grouped by tenant, client, job, or capability — the last of which is what tells you that `qa.fact-checker` is eating 40% of the budget.

---

## What the orchestrator returns

```ts
{
  jobId, status: 'completed',
  result: { /* merged, workflow-shaped: e.g. a ContentCalendar */ },
  summary: {
    tasksTotal: 543, tasksOk: 538, tasksNeedsHuman: 5,
    costUsd: 41.20, durationMs: 486_000,
    costByLayer: { writing: 18.40, qa: 11.80, creative: 7.10, ... }
  },
  needsHuman: [ { taskId, capabilityId, reason, artifactRef } ],
  artifacts: [ ... ]
}
```

It assembled all of this. It wrote none of it.
