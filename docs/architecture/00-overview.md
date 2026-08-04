# 00 — Overview

**Status:** Phase 1 (architecture only — no production code)
**Audience:** engineers, operators, and anyone deciding whether this design survives 500 clients

---

## Mission

An operating system of small, single-responsibility AI agents that creates, edits, manages, publishes, and grows content for real estate agents. Not one large assistant — a fleet of narrow ones coordinated by a deterministic orchestrator.

The system must scale from 1 client to 500+ without redesigning the architecture. "Without redesigning" is a testable claim: going from 1 to 500 clients must require only configuration changes (worker counts, queue weights, budget ceilings) and zero changes to agent contracts, the orchestrator, or the data model.

---

## The five rules, and how each is enforced

The rules below came from the project brief. A rule that depends on human discipline gets violated; each one here is bound to a mechanism that fails the build or the request when broken.

| Rule | Enforcement mechanism |
|---|---|
| **1. Never one massive prompt.** Everything is separated into independent agents. | Every capability is a separate manifest directory with its own prompt file, I/O schemas, and fixtures. A prompt file over a configured token budget fails CI. No agent may `$ref` another agent's prompt. |
| **2. The Orchestrator never performs work.** | The orchestrator package has **no LLM client dependency** — enforced by a dependency-boundary test. It physically cannot call a model. It receives, decomposes, selects, passes context, tracks, retries, merges, returns. |
| **3. Every agent declares 10 fields.** Purpose, responsibilities, inputs, outputs, memory, tools, prompt, failure conditions, success conditions, dependencies. | These are **required keys in `agent-manifest.schema.json`**. A manifest missing `failureConditions` fails schema validation, which fails CI. |
| **4. No duplicated responsibilities.** | A registry lint asserts unique capability ids, and that no two manifests declare overlapping `outputs.$id` for the same `layer`. Five duplications in the original brief were resolved before writing the catalog (see below). |
| **5. Nothing hardcoded.** | Prompts, workflows, routing, model tiers, retry policy, and rate limits are files or database rows. Code contains no capability names — the orchestrator resolves everything through the registry by id. |

---

## Core doctrine

### Agents are data, not code

A capability is a directory, not a class:

```
agency/agents/writing/hook-writer/
  agent.yaml          # the manifest — Rule 3's ten fields
  prompt/v3.md        # versioned, immutable once shipped
  io/input.schema.json
  io/output.schema.json
  fixtures/*.json     # golden input/output pairs = the test suite
```

One `AgentRunner` executes all of them. Adding capability #100 costs two files and zero lines of code.

**Why not one class per agent?** 99 hand-written classes is 99 copies of the same boilerplate (load prompt, fetch memory, call model, validate output, meter cost, emit trace). Every cross-cutting change — a new retry policy, a new cost field, a new redaction rule — becomes a 98-file diff. The manifest approach makes cross-cutting changes one-file changes, and makes agents editable by non-engineers. See [ADR-0002](adr/0002-agents-as-manifests.md).

### Agents vs. connectors

Not every capability in the brief is a reasoning task. "Instagram Publisher" is an OAuth'd HTTP POST. "Invoice Agent" is a template and some arithmetic. Sending those through a language model adds cost, latency, and — worse — the possibility of a hallucinated post going to a real client's audience.

| Kind | Definition | Count | Examples |
|---|---|---|---|
| **agent** | Makes a model call. Produces judgment or content. | 57 | Hook Writer, Content Strategist, Avatar Builder, Compliance QA |
| **connector** | Pure typed function. No model call. Deterministic and replayable. | 23 | Instagram Publisher, Invoice, Webhook Manager, Accessibility QA |
| **hybrid** | Deterministic fetch/measure, then LLM interpretation. Modeled as an agent whose manifest declares a connector as a tool. | 19 | Prospect Finder, Trend Analyst, Performance Reporter, Fact Checker |

Nearly a quarter of the system makes no model call at all.

All three register in the same registry and are invoked identically:

```ts
registry.resolve(capabilityId).execute(envelope, ctx)
```

The distinction is invisible at the call site. It only changes cost, determinism, and how the capability is tested. See [ADR-0003](adr/0003-agents-vs-connectors.md).

### The Orchestrator is code, not a prompt

An LLM that decides which agent runs next is nondeterministic, hard to audit, expensive at every step, and impossible to reason about under load. Instead:

- **Execution is a deterministic DAG executor** over declarative workflow definitions.
- **Planning is the one narrow LLM escape hatch** — the `exec.delivery-planner` agent, invoked *only* when an inbound request matches no known workflow. It returns a proposed DAG, which is schema-validated against the registry before a single task is dispatched.

Planning is an agent. Execution is code. See [ADR-0004](adr/0004-deterministic-orchestrator.md).

### Memory is tiered and scoped, and never holds secrets

Four tiers behind one API — profile (canonical facts), episodic (what happened), semantic (what worked, vector-searchable), metric (numbers over time). Each agent's manifest declares which memory scopes it may read; it physically cannot read outside them. This is what keeps prompts small at 500 clients instead of stuffing an entire client history into context.

**Credentials are never stored in memory.** Platform OAuth tokens live in a separate, envelope-encrypted secrets service. Agents never see them. Only connectors resolve them, at call time, and a redaction layer strips them from every log, trace, and prompt. See [04-memory.md](04-memory.md).

### Compliance is a gate, not a step

Real estate advertising is legally regulated. The Fair Housing Act (24 CFR §100.75) prohibits discriminatory language in housing advertisements; NAR and most state commissions require license number and brokerage attribution; MLS terms restrict reuse of listing photography.

Therefore `qa.compliance` is a **non-bypassable DAG gate**: publish edges are unreachable without a passing verdict, every verdict is written to episodic memory as an audit record, and the failure mode is fail-closed (a compliance error blocks publication; it never warns and proceeds). This is an architectural constraint, not a checklist item. See [09-scalability-security.md](09-scalability-security.md).

---

## Duplications resolved from the original brief

The brief said "never duplicate responsibilities." Five conflicts existed in the capability list as written:

| Conflict | Resolution |
|---|---|
| **Project Manager vs. Orchestrator** — Rule 2 states the Orchestrator *is* the project manager; a separate PM agent duplicates it. | Orchestrator is infrastructure (code). The listed agent becomes **`exec.delivery-planner`**: decomposes a request into a proposed DAG and hands it back. It never executes, tracks, or retries. |
| **Visual QA listed twice** (Creative and QA layers). | One capability: **`qa.visual`**. The Creative layer declares it as a dependency. |
| **SEO Strategist vs. SEO Agent** | **`strategy.seo`** (keyword and topic strategy, an input to writing) vs. **`websites.seo-implementation`** (meta tags, schema.org, sitemaps, an output to a site). Disjoint I/O. |
| **Content Audit vs. Content Reviewer** | **`intake.content-audit`** (one-time, historical, at onboarding) vs. **`analytics.content-reviewer`** (recurring, per-post, after publication). |
| **Memory Manager vs. Database Manager** | Memory is infrastructure (`packages/memory`), not a capability — every agent uses it, so it cannot be one agent's job. **`automation.database-manager`** is narrowed to schema and migration operations. |

Net: 100 listed items − 2 (Visual QA duplicate; Memory Manager promoted to infrastructure) + 1 (`automation.file-storage`, required for media binaries and flagged as an addition) = **99 registry capabilities**, plus 2 infrastructure services that are deliberately *not* capabilities (Orchestrator, Memory).

---

## Layer map

Twelve layers. A layer is an organizational and queue-partitioning boundary, not a runtime one — any capability may depend on any other, provided the dependency graph stays acyclic (lint-enforced).

```
┌─────────────────────────────────────────────────────────────┐
│  API  ·  REST + webhooks + client portal + internal console │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR  (deterministic DAG executor — performs no work) │
└────────────────────────────┬────────────────────────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  REGISTRY → RUNTIME  (one AgentRunner for all 99 capabilities) │
└────────────────────────────┬────────────────────────────────┘
                             ▼
   executive · intake · strategy · writing · creative · video
   publishing · analytics · sales · websites · automation · qa
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  MEMORY (4 tiers)  ·  SECRETS  ·  OBSERVABILITY  ·  STORAGE  │
└─────────────────────────────────────────────────────────────┘
```

---

## Relationship to the existing `scorpion-7.0` code

This repository currently contains a zero-dependency CommonJS design-audit CLI (`lib/audit-engine.js`, `lib/rules/*`, `scripts/design-audit.js`) that drives Chromium over the DevTools Protocol to detect contrast, overflow, oversized-icon, and text-collision defects.

It is unrelated to the agency OS, and it stays where it is:

- The audit tool remains at the repository root, unchanged, and keeps its **zero runtime dependencies** guarantee (enforced by `tests/dependency-check.js`, which reads `process.cwd()/package.json` and is therefore already scoped to the root package).
- The agency OS lives in a new `agency/` npm-workspaces monorepo in TypeScript, with real dependencies.
- The audit engine is **reused, not rebuilt**: `packages/connectors/audit-adapter` wraps `AuditEngine` to implement the `websites.accessibility-qa` connector and the web half of `qa.visual`. `AuditEngine.addRule()` (`lib/audit-engine.js:83`) also serves as the design precedent for the capability registry.

See [ADR-0001](adr/0001-monorepo-and-language.md).

---

## Document index

| Document | Contents |
|---|---|
| [01-layers-and-registry.md](01-layers-and-registry.md) | All 12 layers; the full catalog of 99 capabilities |
| [02-agent-contract.md](02-agent-contract.md) | `AgentManifest`, `TaskEnvelope`, `TaskResult`, error taxonomy |
| [03-orchestrator.md](03-orchestrator.md) | DAG model, scheduling, context passing, retry, merge |
| [04-memory.md](04-memory.md) | Four tiers, scoping, retrieval, retention, the no-secrets rule |
| [05-data-model.md](05-data-model.md) | Postgres schema, tenancy, indexes, migrations |
| [06-infrastructure.md](06-infrastructure.md) | Queues, workers, logging, tracing, config, versioning |
| [07-api-and-frontend.md](07-api-and-frontend.md) | API surface, auth, portal, console |
| [08-execution-flows.md](08-execution-flows.md) | "30 Reels" and three other flows, end to end |
| [09-scalability-security.md](09-scalability-security.md) | 1→500 scaling, cost, threat model, compliance |
| [10-roadmap.md](10-roadmap.md) | Phases 2–7 with acceptance criteria |
| [adr/](adr/) | One ADR per decision, each naming the rejected alternative |
