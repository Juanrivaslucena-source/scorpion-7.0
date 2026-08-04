# 07 — API Layer and Frontend

## Design stance

The API is thin. It authenticates, authorizes, validates, and enqueues. All work is asynchronous — a request for 30 reels returns a `jobId` in ~80ms and streams progress; it does not hold a connection for eight minutes.

Every endpoint is tenant-scoped by the authenticated principal. `tenantId` is never accepted from the client body — it is derived from the token and set on the database connection, which is what makes the RLS policy in [05-data-model.md](05-data-model.md) the actual boundary.

---

## REST surface

```
POST   /v1/requests                 submit work (the main entry point)
GET    /v1/jobs/:id                 job status + summary
GET    /v1/jobs/:id/tasks           task-level detail
GET    /v1/jobs/:id/stream          SSE progress
POST   /v1/jobs/:id/cancel

GET    /v1/clients                  list
POST   /v1/clients                  create → triggers the intake workflow
GET    /v1/clients/:id/profile      resolved profile memory (brand, USP, avatars)
GET    /v1/clients/:id/calendar     content calendar
GET    /v1/clients/:id/analytics    metric rollups

GET    /v1/content                  filterable: kind, status, date
GET    /v1/content/:id
POST   /v1/content/:id/approve      client approval
POST   /v1/content/:id/reject       { reason } — written to memory as signal
POST   /v1/content/:id/revise       { edits } — the highest-value feedback we collect

GET    /v1/capabilities             the registry, introspectable
GET    /v1/capabilities/:id         manifest (prompts redacted for non-operators)
POST   /v1/capabilities/:id/invoke  direct single-capability call (operators only)

POST   /v1/webhooks/:provider       inbound platform callbacks
GET    /v1/usage                    cost and quota
```

`POST /v1/capabilities/:id/invoke` is deliberate: because every capability has schema'd I/O, any one of the 99 can be exercised in isolation from the console or a test. That is the operational payoff of the uniform contract.

### The main entry point

```http
POST /v1/requests
{
  "clientId": "c_8f2a…",
  "request": "I need 30 Instagram Reels this month",
  "constraints": { "deadline": "2026-09-01T00:00:00Z", "budgetUsd": 60 }
}

202 Accepted
{
  "jobId": "j_1a4c…",
  "workflow": "content.reels.monthly@2.1.0",
  "matched": "exact",              // exact | planned  — 'planned' means the LLM planner ran
  "estimate": { "tasks": 310, "costUsd": 38.40, "durationMinutes": 9 },
  "stream": "/v1/jobs/j_1a4c…/stream"
}
```

The cost estimate is returned **before** work begins, and a job whose estimate exceeds the remaining budget returns `402` with the estimate attached rather than starting and stopping halfway.

Structured submission is also accepted (`{"workflow": "content.reels.monthly", "inputs": {...}}`), which skips intent matching entirely — that is what the portal's UI uses. Natural language is the fallback path, not the primary one.

### Progress stream

```
event: task_completed
data: {"capability":"writing.hook-writer","branch":"reel-3","ok":true,"costUsd":0.011}

event: stage_completed
data: {"stage":"production","ok":30,"failed":0}

event: needs_human
data: {"branch":"reel-17","capability":"qa.compliance","reason":"missing license attribution"}

event: job_completed
data: {"status":"partial","tasksOk":307,"needsHuman":3,"costUsd":41.20}
```

---

## Auth and authorization

| Principal | Mechanism | Sees |
|---|---|---|
| Agency staff | session cookie, argon2id + TOTP | everything in their tenant |
| Client | magic link → scoped session | only their own client record |
| Service | API key (hashed at rest), scoped | what the key grants |
| Platform webhook | HMAC signature verification | write-only to its own callback |

Roles: `owner` (billing, users, all clients) · `operator` (all clients, no billing) · `client` (own content, approve/reject/revise only).

Rate limits per tenant plan, plus a global limit per capability that exists to protect *upstream* platform quotas rather than our own servers.

Webhook signatures are verified before the body is parsed, and replay is prevented with a timestamp window plus a seen-signature cache. An unverified webhook never reaches a queue.

---

## Frontend

Two applications, deliberately separate — they have different users, different risk profiles, and different release cadences.

### Client portal (`apps/portal`)

What a real estate agent sees. Optimized for approve/reject on a phone, because that is where it will actually happen.

```
Dashboard      this month at a glance: published, pending approval, performance
Content        the calendar; queue of items awaiting approval
Review         one item at a time — video, caption, hashtags → Approve / Request changes
Analytics      what performed, in plain language (from analytics.performance-reporter)
Brand          the brand profile, editable — edits write to profile memory
Requests       "I need…" free text, and a set of common structured requests
```

The Review screen is the single most important surface in the product. It must be fast, must work one-handed, and must make "request changes" as easy as "approve" — because a rejection with a reason is worth more to the system than an approval.

### Internal console (`apps/console`)

What operators see.

```
Jobs         live DAG view: which stage, which branch, what's stuck
Exceptions   the needs_human queue — the operator's actual workload
Capabilities registry browser; per-capability cost, latency, QA pass rate
Prompts      version history, shadow/canary status, eval results, one-click rollback
Memory       inspect resolved memory per client (credentials never shown — they aren't there)
Costs        by tenant / client / capability / model tier
Compliance   every verdict, filterable; the audit-response surface
```

The Jobs DAG view is what makes a 310-task job debuggable. Without it, "the reels job is slow" is unanswerable; with it, the answer is visibly "reel-17 is on its second repair cycle in `qa.brand`."

**Stack:** Next.js (App Router), TypeScript, server components for data-heavy views, SSE for live job state. Types are imported from `packages/contracts` — the frontend and backend cannot drift, because they share the same generated types.

---

## Public API for clients

Same REST surface, API-key authenticated, so an agency can wire the system into its own tooling. Versioned under `/v1` with a stated deprecation policy: a version stays supported for 12 months after its successor ships. Webhooks (`job.completed`, `content.needs_approval`, `publication.published`, `compliance.blocked`) let integrators avoid polling.
