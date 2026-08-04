# ADR-0003 — Split capabilities into agents and connectors

**Status:** Accepted (Phase 1) · **Date:** 2026-08-04

## Context

The original brief listed ~100 "agents," among them Instagram Publisher, Invoice Agent, Database Manager, Webhook Manager, Notification Agent, and Analytics Collector. None of those involves judgment. Instagram Publisher is an OAuth'd HTTP POST. Invoice Agent is a template and arithmetic.

## Decision

Three kinds, one registry, one call site:

| Kind | Model call | Count |
|---|---|---|
| `agent` | yes | 57 |
| `connector` | no | 23 |
| `hybrid` | deterministic tool, then model interpretation | 19 |

All three declare the same ten Rule 3 fields and are invoked identically:

```ts
registry.resolve(capabilityId).execute(envelope, ctx)
```

Callers cannot tell the difference. The distinction changes cost, determinism, and test strategy — nothing else.

## Alternatives rejected

**Everything is an LLM agent.** Conceptually uniform and materially worse:

- *Cost.* 23 capabilities would make model calls for work that is a function call. At 500 clients, `analytics.collector` alone runs ~180,000 times a year.
- *Correctness.* A model deciding what to POST to Instagram can get it wrong in ways an HTTP client cannot. The failure lands on a real client's public audience.
- *Testability.* Connectors are asserted exactly. Agents need fixtures, judges, and tolerance bands.
- *Latency.* A publish becomes seconds instead of milliseconds.

**Two separate systems — an "agent framework" and a "service layer."** Forces the orchestrator to know which world each capability lives in, duplicates the registry, the retry logic, and the observability, and makes converting a capability from one kind to the other a migration instead of a one-line manifest edit.

## Consequences

Roughly a quarter of the system is deterministic, replayable, exactly testable, and nearly free to run. Connectors also become the only components holding credentials, which is what makes the "agents cannot reach secrets" boundary in ADR-0005 enforceable.

The classification is a judgment call at the margins. `qa.grammar` could be a pure linter; it is `hybrid` because style judgment is not expressible in rules. `sales.contract-generator` is `hybrid` and deliberately conservative — templated assembly, with anything off-template escalated to a human, because generative contract drafting is a liability the architecture declines to take on. Reclassifying a capability is a manifest edit, not a redesign.
