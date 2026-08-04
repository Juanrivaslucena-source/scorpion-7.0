# 09 — Scalability, Security, Compliance

## The scaling claim, stated testably

> Scale from 1 to 500+ clients without redesigning the architecture.

**Testable form:** going from 1 to 500 clients requires only changes to configuration — worker counts, queue weights, concurrency caps, budget ceilings — and **zero changes** to capability manifests, the orchestrator, the data model, or any interface in `packages/contracts`.

Everything below is what makes that true.

---

## Where the load actually goes

At 500 clients producing 30 reels/month each:

| Dimension | Volume |
|---|---|
| Jobs | ~500/month (plus ~2,000 scheduled analytics jobs) |
| Tasks | ~271,000/month ≈ **9,000/day** ≈ 0.1/sec average |
| Peak | ~20× average (month-start clustering) ≈ **2/sec** |
| Model calls | ~200,000/month |
| Metric rows | ~1.35M/month (15,000 publications × 3 collections × ~30 metrics) |
| Storage | ~4 TB/year of video and image assets |

**2 tasks/sec at peak is not a hard engineering problem.** The hard problems are cost, fairness, and isolation — which is where the design effort went.

---

## Scaling levers (all configuration)

| Constraint | Lever | Ceiling before redesign |
|---|---|---|
| Worker throughput | replica count per layer queue | very high — workers are stateless |
| Queue throughput | Redis; partitioned by layer | ~10k jobs/sec, ~5000× headroom |
| Postgres writes | connection pooling (PgBouncer); tasks table partitioned by month | ~5k writes/sec |
| Vector search | HNSW, partial index, per-client filter | millions of rows |
| Metric volume | monthly partitions; detach to drop | unbounded |
| Model rate limits | per-capability concurrency caps + tier fallback | provider-negotiated |
| Platform rate limits | per-provider circuit breakers in `automation.api-manager` | platform-imposed |

The genuine ceiling is **platform API rate limits**, which are per-app, not per-tenant, and no architecture removes them. Mitigations: per-capability concurrency caps (`publishing.instagram: 2`), publish-time smoothing across the day, and per-client app registration for large agencies.

---

## Fairness — the real multi-tenant problem

One agency scheduling 500 reels must not starve the other 499. Three mechanisms:

1. **Per-tenant concurrency caps** by plan (`starter: 5`, `growth: 20`, `agency: 60`). A tenant cannot occupy more than its share of workers regardless of queue depth.
2. **Weighted fair queuing** within each layer queue: the scheduler round-robins across tenants with pending work rather than draining by insertion order.
3. **Budget ceilings checked before dispatch.** A runaway job halts at its ceiling instead of consuming the shared model rate limit.

Without these, the system is fair on average and unusable at the moment it matters — the first of the month, when everyone submits at once.

---

## Cost model

| Per unit | Cost |
|---|---|
| One reel, end to end | ~$1.37 |
| 30 reels/month | ~$41 |
| Client onboarding (once) | ~$12 |
| Weekly analytics | ~$2/client/week ≈ $8.70/month |
| **Per client/month, steady state** | **~$50** |
| **500 clients/month** | **~$25,000** |

Infrastructure at that scale is roughly $2–4k/month, so model spend dominates by ~8×. That ratio drives three architectural choices:

- **The agent/connector split.** 23 capabilities make no model call. Making `publishing.*` and `analytics.collector` agents would add cost and buy nothing.
- **Tier per manifest.** `writing.*` runs `fast`; `qa.compliance` runs `deep`. A global model setting would either overpay for hooks or underpay for compliance.
- **Prompt caching on stable prefixes.** System prompt + brand guidelines are identical across all 30 reels in a job — caching that prefix is a large, structural saving, and it works *because* memory is scoped and therefore stable.

**Cost is metered per task, attributed to tenant/client/job/capability, and checked before dispatch.** Discovering an overrun on the invoice is not a monitoring strategy.

---

## Security

### Tenant isolation

Postgres row-level security on `tenant_id`, enforced by the database, with the application connecting as a non-superuser role. An ORM bug or a forgotten `WHERE` cannot cross tenants. A test asserts that a query without `app.tenant_id` set **throws** rather than returning everything.

### Credentials

Fully specified in [04-memory.md](04-memory.md). The load-bearing points:

- No credential in any memory tier. Ever.
- `credentials` is a separate table, envelope-encrypted with per-tenant data keys, and **the agent runtime Postgres role has no grant on it.** An agent cannot read a token even if prompt injection convinces it to try.
- Only connectors resolve secrets, at call time, never returning them in a `TaskResult`.
- One centralized redaction serializer in front of every log, span, prompt, and stored payload. A lint rule forbids bypassing it.
- Write-path secret scanning rejects any memory write matching a secret pattern — the defense against a client pasting an API key into a discovery transcript.
- Client platform access is OAuth-only. The system never asks for or stores a platform password.

### Prompt injection

A real threat here, because agents ingest untrusted text: client transcripts, competitor websites, comments, scraped listings.

| Defense | Mechanism |
|---|---|
| Structural | Untrusted content is delimited and labeled as data in every prompt template; the compiler enforces the wrapper — an agent cannot construct a raw prompt |
| Capability | Agents have no credential access and no arbitrary tool access; `tools` is an explicit allowlist per manifest |
| Output | Every output is schema-validated. An injected instruction cannot produce a structurally different result |
| Action | Only connectors act. An agent persuaded to "publish immediately" has no publish path — it can only return JSON |
| Gate | `qa.compliance` and `qa.final-approval` sit between all generated content and publication |

The architectural answer is that **compromising an agent yields no capability**: it cannot read secrets, cannot call unlisted tools, cannot act, and cannot bypass a gate. The blast radius of a fully compromised agent is one bad JSON document, which then fails QA.

### Other controls

Encryption in transit (TLS 1.3) and at rest (AES-256). Argon2id password hashing, TOTP MFA for operators. Least-privilege Postgres roles per runtime (`app_agent_runtime`, `app_connector_runtime`, `app_readonly`). Every credential access and cross-client read is audit-logged. Dependency scanning and secret scanning in CI.

---

## Compliance — the domain constraint

Real estate advertising is regulated. This is not a feature; it is a constraint on the architecture.

| Requirement | Source | Enforcement |
|---|---|---|
| No discriminatory language | Fair Housing Act, 24 CFR §100.75 | `qa.compliance` lexicon + model review; **non-bypassable gate** |
| License number + brokerage attribution | NAR + state commission rules | required columns on `clients`; checked per asset |
| Team/brokerage name prominence | state advertising rules | `qa.compliance` |
| Listing photo usage rights | MLS terms | asset rights check |
| Testimonial substantiation | FTC endorsement guides | `qa.fact-checker` |
| Email opt-out | CAN-SPAM | `writing.email-writer` template requirement |

**Protected classes under the FHA:** race, color, religion, sex, familial status, national origin, disability. The lexicon covers the obvious violations and the non-obvious ones that generative models produce constantly — "perfect for young families" (familial status), "safe neighborhood" (a well-known proxy), "walking distance" (disability), "great for singles."

That last category is exactly why compliance is a **gate and not a prompt instruction**. A model told "avoid discriminatory language" will still write "perfect for young families," because it reads as warm and helpful rather than as steering. The architecture assumes generation will produce violations and catches them structurally:

1. **Workflow validation** — any workflow with a publish node reachable without a non-bypassable compliance gate fails to load.
2. **Schema** — `publications.compliance_verdict_id` is `NOT NULL`. The row is uninsertable without a verdict.
3. **Audit** — every verdict, pass and fail, is persisted with its checks, retained 7 years.
4. **Monitoring** — `compliance_block_total{client,check}` is an alerting metric. A spike means a prompt regressed.

Data protection: GDPR/CCPA deletion is a single cascade across all four memory tiers, object storage, and the secrets service, executed transactionally with a verification report. Data residency, if required, is per-tenant database placement — the one case where a tenant gets its own database rather than an RLS partition.

---

## Reliability targets

| | Target |
|---|---|
| API availability | 99.9% |
| Job completion (no human needed) | 95% |
| Publish success | 99.5% |
| Compliance false-negative rate | **0 tolerated** — every escape is a P1 incident and a lexicon update |
| Recovery point objective | 5 min (Postgres PITR) |
| Recovery time objective | 30 min |

Redis is treated as fast, not durable — Postgres is always the source of truth for job state. Losing Redis loses queue position, not work: a reconciliation sweep re-enqueues from the `tasks` table, and idempotency keys make the replay safe.
