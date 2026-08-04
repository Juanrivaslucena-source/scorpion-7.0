# ADR-0005 — Four memory tiers; credentials in a separate service

**Status:** Accepted (Phase 1) · **Date:** 2026-08-04

## Context

The brief requires long-term memory of clients, brand guidelines, tone, previous content, performance metrics, winning hooks and scripts, analytics, feedback, ideas, rejected ideas, content calendar, and website information — and states that **passwords must never be stored**. It also lists a "Memory Manager" agent.

## Decision

**Four tiers behind one service:** profile (canonical facts, relational, versioned) · episodic (append-only history, audit trail) · semantic (pgvector, performance-weighted retrieval) · metric (time-partitioned numbers).

**Memory is infrastructure, not a capability.** There is no Memory Manager agent. Every capability depends on memory, so it cannot be one capability's responsibility — and routing every read through an agent would put a model call, a queue hop, and a failure mode in front of every lookup.

**Access is scoped by manifest.** An agent declares `memory.read`; the orchestrator resolves exactly those scopes and delivers an immutable snapshot inside the `TaskEnvelope`. Agents cannot issue arbitrary queries.

**Credentials live in a separate service** with a different threat model: envelope-encrypted with per-tenant data keys, in a separate table, on a separate Postgres role. **The agent runtime role has no grant on that table.** Only connectors resolve secrets, at call time. One centralized redaction serializer guards every log, span, prompt, and stored payload. Write-path scanning rejects any memory write matching a secret pattern.

## Alternatives rejected

**One flat memory store.** Content, metrics, and history have different access patterns, retention rules, and index requirements. Putting 1.35M monthly metric rows in the same table as brand guidelines makes both slow.

**Unscoped memory — "give the agent everything about this client."** Impossible at two years of history and ruinous at any size. Scoping is what keeps `writing.hook-writer`'s snapshot at ~2 KB whether the client is two weeks or two years old. **Prompt size stays constant as account history grows** — that property, not a bigger context window, is what makes the cost model survive 500 clients.

**Credentials in memory with an "agents shouldn't read them" convention.** A convention is not a boundary. Prompt injection, an over-broad scope, or a logging mistake turns it into a breach. A missing Postgres grant does not have those failure modes.

**Pure cosine similarity for retrieval.** Retrieves things resembling the query. The actual question is what resembled the query *and worked* — hence `0.5·similarity + 0.3·performance + 0.2·recency`.

## Consequences

The learning loop runs without prompt edits: analytics writes winning hooks to the semantic tier with performance metadata, and the next month's hook writer retrieves them weighted by that performance. Quality compounds with account age while prompts stay short and stable.

Scope declarations must be maintained — an agent whose scopes are wrong produces worse output. Mitigated by the eval suite, which will surface quality regressions from a bad scope change.

Rejected ideas are a first-class scope. Without them the system re-proposes a concept the client killed three months ago, which is the fastest way to look like it has no memory at all.
