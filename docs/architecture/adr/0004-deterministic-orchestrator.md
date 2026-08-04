# ADR-0004 — The Orchestrator is deterministic code, not an LLM

**Status:** Accepted (Phase 1) · **Date:** 2026-08-04

## Context

Rule 2: the Orchestrator never performs work — it receives, decomposes, selects, passes context, tracks, retries, merges, returns. The obvious implementation is an LLM with the capability catalog as tools, reasoning about what to run next. That is the common pattern, and it is wrong at this scale.

## Decision

**Execution is a deterministic DAG executor** over declarative workflow definitions. `packages/orchestrator` declares no dependency on any LLM client, on `packages/runtime`, or on any prompt — enforced by a CI dependency-boundary test. It physically cannot call a model.

**Planning is the single narrow exception.** A request matching no known workflow invokes `exec.delivery-planner`, a normal capability, through the queue. Its proposed DAG is then validated before any task is dispatched:

1. every `capabilityId` resolves in the registry
2. every edge's producer output schema satisfies the consumer input schema
3. the graph is acyclic
4. estimated cost is within the client's remaining budget
5. **every path reaching a publish node passes through a non-bypassable `qa.compliance` gate**

Fail any check → reject, retry planning once, escalate to a human.

## Alternatives rejected

**LLM orchestrator deciding each next step.** Nondeterministic (the same request produces different plans), expensive (a model call per routing decision — for the 30-reel flow, hundreds), slow, unauditable ("why did reel 17 skip QA?" has no answer), and untestable without mocking a model in every orchestration test. Most seriously: it can route around the compliance gate, and the failure would be silent.

**No planning at all — workflows only.** Simpler and fully deterministic, but every new request type requires an engineer. Unacceptable for an agency taking varied client requests.

## Consequences

The 30-reel flow makes **zero orchestration model calls**. Every routing decision is reproducible, auditable, and unit-testable without a model. Jobs replay exactly.

The model proposes; the schema disposes. A planner that hallucinates a capability, produces a cycle, or omits compliance is rejected before a task exists. **The model cannot route around the compliance gate** — check 5 is enforced by the validator, not by the planner's judgment.

Cost: known request types must be defined as workflow YAML. This is a feature — successful ad-hoc plans get promoted by an operator into named workflows, after which that request type takes the deterministic path forever and never pays for planning again.
