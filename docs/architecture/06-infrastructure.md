# 06 — Infrastructure

Queues, workers, configuration, versioning, logging, tracing, and cost metering.

Every external dependency sits behind an interface in `packages/contracts`. Postgres, Redis, and S3 are the chosen implementations, not architectural assumptions — swapping any of them is a package change, not a redesign.

---

## Repository layout

```
scorpion-7.0/
├── lib/  scripts/  tests/          # UNCHANGED design-audit tool, zero runtime deps
├── package.json                    # root workspace; dependency-check.js guards THIS package
├── docs/architecture/              # this documentation
└── agency/                         # npm workspaces monorepo, TypeScript, strict
    ├── packages/
    │   ├── contracts/              # zod schemas + generated TS types. NO logic, NO deps.
    │   ├── registry/               # manifest loader, validator, semver resolution
    │   ├── runtime/                # AgentRunner, PromptCompiler, ToolBus, LlmClient
    │   ├── orchestrator/           # DAG executor, scheduler, retry, merge  ← no LLM dep
    │   ├── memory/                 # 4-tier service, scope resolution, redaction
    │   ├── secrets/                # envelope encryption, scope-gated resolution
    │   ├── connectors/             # 23 deterministic services
    │   │   └── audit-adapter/      # wraps ../../../lib/audit-engine.js  ← reuse
    │   ├── workflows/              # declarative YAML definitions + validator
    │   ├── queue/                  # BullMQ adapter behind a Queue interface
    │   ├── observability/          # logging, tracing, metering, redaction serializer
    │   ├── api/                    # Fastify: REST + webhooks + SSE
    │   └── worker/                 # queue consumers
    ├── agents/<layer>/<name>/      # 99 manifest directories
    ├── schemas/                    # agent-manifest, task-envelope, task-result
    ├── registry/catalog.yaml       # the capability catalog
    └── apps/
        ├── portal/                 # client-facing (Next.js)
        └── console/                # internal operator UI (Next.js)
```

**The dependency-boundary test** (Rule 2, mechanized) lives in CI and asserts:

| Package | May not depend on |
|---|---|
| `orchestrator` | `runtime`, any LLM client, `agents/**` |
| `contracts` | anything |
| `connectors/*` | `runtime`, any LLM client |
| `agents/**` (manifests) | — cannot import at all; they are data |
| any agent-runtime code | `secrets` |

The last row is what makes "agents cannot reach credentials" structural rather than aspirational.

---

## Queues

Redis + BullMQ, behind a `Queue` interface. **One queue per layer**, not one global queue.

```
q:writing      q:creative     q:video       q:publishing
q:strategy     q:analytics    q:qa          q:sales
q:intake       q:websites     q:automation  q:executive
q:dlq
```

**Why partition by layer?** Video generation takes minutes; a hook takes two seconds. In a single queue, one client's 30-reel video batch parks behind every fast task in the system. Separate queues let each layer scale its worker pool independently — `q:video` might run 4 workers at high memory, `q:writing` 40 at low.

**Fairness across tenants.** Within a queue, jobs carry a priority derived from plan tier and a per-tenant concurrency cap:

```yaml
concurrency:
  perTenant:  { default: 20, byPlan: { starter: 5, growth: 20, agency: 60 } }
  perCapability: { video.higgsfield-prompt: 4, publishing.instagram: 2 }
```

The `perCapability` caps exist because platform rate limits are per-app, not per-tenant — 500 clients publishing at once would trip Instagram's limit regardless of how fairly the work was distributed.

**Reliability.** At-least-once delivery, which is safe because every task carries a derived `idempotencyKey` with a unique constraint behind it (see [05-data-model.md](05-data-model.md)). Visibility timeouts sized per layer. Four failed attempts → DLQ → `exec.operations-manager`.

Scheduled work (`analytics.collector` at 24h/7d/30d, publish times) uses BullMQ delayed jobs, with a Postgres-backed reconciliation sweep every five minutes to catch anything Redis lost. Redis is treated as fast, not durable — Postgres is the source of truth for job state, always.

---

## Workers

Stateless Node processes. `WORKER_QUEUES=writing,qa` selects what a pod consumes, so the same image scales any layer.

```
worker boot:
  1. load + validate registry (fail fast on any invalid manifest)
  2. connect Postgres, Redis, object storage
  3. subscribe to configured queues
  4. per task: fetch envelope → resolve capability → execute → persist → ack
  5. SIGTERM: stop accepting, finish in-flight (grace 120s), exit
```

Graceful drain matters: a killed worker mid-publish is the one place at-least-once delivery could double-post, and the idempotency key is the backstop.

---

## Configuration

Three layers, most specific wins. Nothing is hardcoded (Rule 5).

| Layer | Source | Examples |
|---|---|---|
| Environment | env vars / secret manager | connection strings, API keys, `NODE_ENV` |
| System | versioned YAML in-repo | model tier→model mapping, retry policy, queue weights, budgets |
| Tenant | database rows | plan, concurrency, budget ceiling, enabled capabilities, canary flags |

```yaml
# agency/config/models.yaml — changing a model is a config edit, not a deploy
tiers:
  fast:     { provider: anthropic, model: claude-haiku-4-5-20251001, maxOutputTokens: 4096 }
  balanced: { provider: anthropic, model: claude-sonnet-5,           maxOutputTokens: 8192 }
  deep:     { provider: anthropic, model: claude-opus-5,             maxOutputTokens: 16384 }
fallback:
  fast:     [balanced]        # on provider outage, escalate tier rather than fail
```

Manifests name a **tier**, never a model id. Re-pointing all 76 model-calling capabilities at a new model is a one-line change, and no manifest mentions a vendor.

---

## Versioning

Four independently versioned things:

| Artifact | Scheme | Change means |
|---|---|---|
| Capability | semver in manifest | minor = prompt/model change; major = I/O schema change |
| Prompt | immutable file `prompt/vN.md` | new file, never an edit |
| Workflow | semver in definition | running jobs pin their version at start |
| Schema | migration number | forward-only |

**Prompt rollout** is staged and reversible:

```
shadow  → run v4 beside v3 on live traffic, compare, serve v3   (no user impact)
canary  → 10% of tenants get v4, monitored on cost/latency/QA pass rate
full    → 100%
rollback→ flip a tenant config flag; no deploy
```

Promotion between stages requires the eval gate to pass: v4 must not regress QA pass rate or cost by more than a configured threshold on the golden fixture set. Because the registry resolves by semver range, v3 and v4 run concurrently in the same process.

**Running jobs pin versions at start.** A 30-reel job that begins under workflow v2.1.0 and capability set X finishes under them, even if a rollout lands mid-run. Mixed-version output within a single deliverable would be invisible in testing and obvious to the client.

---

## Logging, tracing, metering

**Structured JSON logs**, always carrying `correlationId`, `jobId`, `taskId`, `tenantId`, `clientId`, `capabilityId`. Every log passes through the redaction serializer — the same one guarding prompts and traces. There is no `console.log` path that bypasses it; a lint rule forbids direct console use outside the logger package.

**Tracing** via OpenTelemetry, one trace per client request:

```
request (correlationId)
└── job content.reels.monthly
    ├── stage:strategy
    │   └── task strategy.content
    │       ├── memory.resolve      (12ms)
    │       ├── llm.call            (2,840ms, 1,204 in / 890 out tokens, $0.011)
    │       └── output.validate     (3ms)
    └── stage:production
        └── branch:reel-17 …
```

Spans record token counts and cost inline, which makes "why did this job cost $41" answerable by opening one trace.

**Metrics** (Prometheus):

- `task_duration_seconds{capability,status}` — p50/p95/p99
- `task_cost_usd_total{tenant,client,capability}`
- `queue_depth{queue}` and `queue_wait_seconds{queue}`
- `qa_verdict_total{capability,verdict}` — the quality signal
- `compliance_block_total{client,check}` — the one that must be watched
- `llm_provider_errors_total{provider,code}`

**Alerts that page:** DLQ depth > 0 for 5 minutes; any queue's p95 wait > 10 minutes; tenant cost > 120% of budget; compliance blocks up 3× week-over-week; QA pass rate down > 10 points day-over-day.

**Cost metering** is per task, attributed up the chain (task → job → client → tenant), checked *before* dispatch rather than after the bill. A job that would exceed its remaining budget halts and notifies instead of proceeding.

---

## Deployment

Containers. One image, role selected by env (`api`, `worker`, `scheduler`). Postgres and Redis managed; object storage S3-compatible.

```
                     ┌──────────┐
    clients ────────►│   CDN    │
                     └────┬─────┘
                          ▼
                 ┌────────────────┐
                 │  api (2–10×)   │──── SSE progress
                 └───┬────────┬───┘
                     ▼        ▼
              ┌──────────┐  ┌─────────┐
              │ Postgres │  │  Redis  │
              │ +pgvector│  │ BullMQ  │
              └────┬─────┘  └────┬────┘
                   │             ▼
                   │   ┌──────────────────────┐
                   └───│ workers (per layer)  │───► model & platform APIs
                       │ writing 2–40         │     (all via automation.api-manager)
                       │ video   1–8          │
                       │ qa      2–20 …       │
                       └──────────────────────┘
                                 │
                                 ▼
                        ┌────────────────┐
                        │ object storage │
                        └────────────────┘
```

Autoscaling is driven by `queue_wait_seconds`, not CPU — these workers are I/O-bound on model and platform APIs, so CPU is a poor signal.

Environments: `local` (docker-compose, stubbed model + platform APIs), `staging` (real models, sandbox platform accounts), `production`. The stubbed model in local is what makes the golden-fixture suite runnable offline and in CI.
