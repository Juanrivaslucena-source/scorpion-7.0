# ADR-0002 — Agents are declarative manifests, not classes

**Status:** Accepted (Phase 1) · **Date:** 2026-08-04

## Context

99 capabilities. Rule 3 requires each to declare ten fields. Rule 1 forbids one massive prompt. Both need enforcement that survives a team growing and a codebase aging.

## Decision

A capability is a directory of data, not a class:

```
agency/agents/<layer>/<name>/
  agent.yaml            # the ten Rule 3 fields
  prompt/vN.md          # versioned, immutable once shipped
  io/{input,output}.schema.json
  fixtures/*.json
```

One `AgentRunner` in `packages/runtime` executes all of them. The ten fields are **required keys in `agent-manifest.schema.json`** — a manifest missing `failureConditions` fails validation, which fails CI.

## Alternatives rejected

**One class per capability.** 99 copies of the same boilerplate: load prompt, resolve memory, call model, validate output, meter cost, emit trace. Every cross-cutting change — a new retry policy, a cost field, a redaction rule — becomes a 99-file diff. Worse, Rule 3 becomes advisory: nothing stops a class from omitting `failureConditions`, or from quietly growing a second responsibility.

**A base class plus 99 thin subclasses.** Better, but still requires a code change and a deploy to add or edit a capability, still lets subclasses override their way out of the contract, and still keeps prompts locked inside a codebase that non-engineers cannot touch.

## Consequences

**Gained:** adding capability #100 is two files and zero code. Cross-cutting changes are one-file changes. Rule 3 is machine-enforced. Prompts are editable by content people. Manifests are diffable and reviewable as content. Phase 3 parallelizes cleanly because manifests are independent by construction.

**Given up:** per-capability bespoke logic. A capability needing genuinely custom control flow must either be a `connector` with an `impl` pointer, or become a workflow composed of several capabilities. In practice this is a feature — it pushes back on capabilities quietly accumulating a second responsibility, which is Rule 4.

**Risk:** the manifest schema becomes a bottleneck if it is under-expressive. Mitigated by building three reference capabilities (one per kind) in Phase 3a, before scaling to 99.
