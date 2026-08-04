# 10 — Roadmap

Seven phases. Each stops for approval. Each has an acceptance gate that is demonstrable, not a matter of opinion.

---

## Phase 1 — Architecture ✅ (this document set)

**Delivered:** 11 architecture documents, 6 ADRs, `agent-manifest.schema.json`, `task-envelope.schema.json`, `catalog.yaml` with all 99 capabilities.

**Acceptance:**
- [x] Every capability appears exactly once with a unique id, kind, layer, and dependencies
- [x] The manifest schema expresses all three kinds (agent, connector, hybrid)
- [x] The 30-Reel flow is traceable end to end with no orphan edges
- [x] Both adversarial scenarios (compliance failure mid-fan-out; token expiry mid-publish) resolve from the documents alone
- [x] Rules 1–5 each bound to an enforcement mechanism, not to discipline
- [x] The existing design-audit tool is untouched and still passes `npm run verify`

---

## Phase 2 — Orchestrator

The riskiest component, built first, against stub capabilities. If the orchestrator is wrong, all 99 capabilities are built on sand.

**Build:** `packages/contracts` (zod schemas + generated types) · `packages/queue` (BullMQ behind the `Queue` interface) · `packages/registry` (loader, validator, semver resolution) · `packages/orchestrator` (DAG executor, scheduler, retry, merges, compensation) · Postgres schema + migrations · `packages/observability`.

**Acceptance gate:**
1. A 3-task stub workflow runs end to end and persists correct state
2. A fan-out of 30 stub branches respects concurrency caps
3. A killed worker mid-job resumes with zero duplicate side effects
4. Each retry class from the error taxonomy behaves as specified
5. All five merge strategies pass unit tests
6. **The dependency-boundary test passes: `packages/orchestrator` has no path to an LLM client** (Rule 2, mechanized)
7. A workflow with a publish node reachable without a compliance gate **fails to load**

Gate 7 is the one to build first. Everything else is recoverable; that one is a legal exposure.

---

## Phase 3 — Capabilities

99 manifests, prompts, I/O schemas, and fixtures. Built in dependency order, not alphabetically.

| Wave | Scope | Why this order |
|---|---|---|
| 3a | `packages/runtime` (AgentRunner, PromptCompiler, ToolBus, LlmClient) + 3 reference capabilities (one agent, one connector, one hybrid) | proves the contract before scaling it 99× |
| 3b | 23 connectors, including `connectors/audit-adapter` wrapping the existing `lib/audit-engine.js` | deterministic, testable without a model, unblocks publishing |
| 3c | intake (10) + strategy (7) | everything downstream reads their profile output |
| 3d | writing (14) + creative (8) | the volume tier |
| 3e | video (10) + qa (6) | qa depends on brand + creative output |
| 3f | analytics (7) + sales (8) + websites (7) + executive (6) + automation agent (1) | |

**Acceptance:** every manifest schema-valid with all ten Rule 3 fields · every agent/hybrid has ≥1 golden fixture · every connector has ≥1 contract test · registry lints pass (unique ids, acyclic, no duplicate outputs, all deps resolve) · each capability passes the isolation test (loads and runs with an empty registry).

**Reference:** the audit adapter reuses `AuditEngine` and `AuditEngine.addRule()` (`lib/audit-engine.js:83`) rather than reimplementing contrast/overflow/icon/collision detection.

---

## Phase 4 — Memory

**Build:** `packages/memory` (4 tiers, scope resolution, immutable snapshots, validated writes) · pgvector HNSW indexes + the weighted retrieval query · `packages/secrets` (envelope encryption, per-tenant DEKs, scope-gated resolution) · the redaction serializer · retention and deletion jobs.

**Acceptance gate:**
1. Scope resolution returns exactly the declared scopes; an undeclared read throws
2. Semantic retrieval reflects the weighted formula (similarity 0.5 / performance 0.3 / recency 0.2), verified against a seeded corpus
3. **A credential is provably absent from prompts, logs, traces, and every memory tier** — asserted by a test that plants a canary token and greps every output channel
4. The agent runtime Postgres role has **no grant** on `credentials` — asserted by a permissions test
5. A memory write containing a secret pattern is rejected and raises a security event
6. Client deletion cascades across all four tiers, object storage, and secrets, with a verification report
7. Snapshot size for `writing.hook-writer` stays ~constant against clients with 10, 1,000, and 100,000 content items — **this is the scaling claim, measured**

---

## Phase 5 — Workflows

**Build:** `content.reels.monthly` · `client.onboarding` · `analytics.weekly` · `sales.outbound` · `website.build` · the workflow validator · `exec.delivery-planner` and the plan-validation path.

**Acceptance gate:**
1. The 30-Reel flow runs end to end against sandbox platform accounts
2. The repair loop resolves an injected `qa.brand` failure within 2 cycles
3. An injected `qa.compliance` failure blocks publication and surfaces as `needs_human`
4. A planner-produced DAG that omits a compliance gate is **rejected by the validator** (Flow 4's critical check)
5. Both adversarial scenarios from [08-execution-flows.md](08-execution-flows.md) reproduce and resolve as documented
6. Cost for the 30-reel job lands within 25% of the $41 estimate

---

## Phase 6 — Testing

**Build:** the shared capability harness (schema round-trip, manifest validity, isolation, memory scope, budget — written once, applied to all 99) · golden fixture runner with a stubbed model · LLM-as-judge eval suite scoring output against each manifest's `successConditions` · load tests · chaos tests · the CI pipeline.

**Acceptance gate:**
1. ≥80% line coverage on `orchestrator`, `memory`, `registry`, `runtime`
2. Every capability passes the shared harness
3. Eval suite produces a per-capability quality score and gates prompt promotion
4. Load test: 2,000 tasks/hour sustained, p95 queue wait < 60s
5. Chaos: worker kills, Redis loss, Postgres failover, provider 500s — no data loss, no duplicate publishes
6. **A deliberately weakened `qa.compliance` prompt is caught by the eval suite** — the regression guard on the highest-risk capability
7. The repo-root `npm run verify` still passes, proving the audit tool was never disturbed

---

## Phase 7 — Deployment

**Build:** container images · IaC · staged environments · migration automation · dashboards + alerts · runbooks · on-call rotation · backup/restore verification · the client portal and internal console.

**Acceptance gate:**
1. One-command deploy to staging; production behind an approval
2. Zero-downtime migration proven against production-shaped data
3. Backup restored into a scratch environment and verified — a backup that has never been restored is a hypothesis
4. Dashboards live: cost by tenant, queue depth, QA pass rate, compliance blocks
5. Alerts fire correctly in a game day exercise
6. Runbooks exist for: DLQ drain, token re-authorization, provider outage, compliance escape, cost overrun
7. **One real client onboarded end to end and publishing**

---

## Sequencing rationale

Three deliberate choices worth stating:

**The orchestrator is built before any real capability.** Its interfaces constrain all 99. Discovering a contract flaw after writing 99 manifests is the single most expensive mistake available in this project.

**Connectors are built before agents.** They are deterministic and testable without a model, they unblock the publish path, and they make the agent/connector split concrete early rather than aspirational.

**Compliance gating is built in Phase 2, not Phase 6.** It is the only requirement whose failure mode is legal rather than technical. It ships with the first line of orchestrator code — before there is any content it could fail to catch.

## Effort estimate

| Phase | Estimate |
|---|---|
| 2 — Orchestrator | 3–4 weeks |
| 3 — Capabilities | 6–8 weeks (parallelizable across waves) |
| 4 — Memory | 2–3 weeks |
| 5 — Workflows | 2–3 weeks |
| 6 — Testing | 3–4 weeks (overlaps 3–5) |
| 7 — Deployment | 2–3 weeks |
| **Total** | **~4–5 months** to one real client in production |

Phase 3 dominates and parallelizes best, because manifests are independent by construction — which is the payoff of the manifest decision, realized as schedule rather than as elegance.
