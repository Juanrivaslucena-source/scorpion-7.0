# ADR-0006 — Compliance is a structural gate, not a QA step

**Status:** Accepted (Phase 1) · **Date:** 2026-08-04

## Context

This system generates advertising for licensed real estate professionals. That content is regulated:

- **Fair Housing Act, 24 CFR §100.75** — advertisements may not indicate a preference or limitation based on race, color, religion, sex, familial status, national origin, or disability.
- **NAR and state commission rules** — advertising must carry license number and brokerage attribution.
- **MLS terms** — restrict reuse of listing photography.
- **FTC endorsement guides** — testimonials require substantiation.

Liability lands on the *client's license*. A Fair Housing complaint is not a bug report.

## Decision

`qa.compliance` is a **non-bypassable gate**, enforced at four independent levels:

1. **Workflow validation.** Any workflow definition in which a publish node is reachable without traversing a non-bypassable compliance gate **fails to load**. There is no configuration that disables this.
2. **Plan validation.** Any LLM-proposed DAG (ADR-0004) omitting the gate is rejected before a task is dispatched.
3. **Schema.** `publications.compliance_verdict_id` is `NOT NULL` with a foreign key. A publication row is uninsertable without a passing verdict — so even an orchestrator bug, or a hand-written `INSERT`, cannot publish uncleared content.
4. **Audit.** Every verdict, pass and fail, is persisted to `compliance_verdicts` with its individual checks and retained seven years.

Failure is **fail-closed**: a compliance error blocks publication. It never warns and proceeds.

## Alternatives rejected

**"Avoid discriminatory language" as a prompt instruction.** This does not work, and the reason is specific: the violations models produce most often are the ones that read as *warm*. "Perfect for young families" is familial-status steering. "Safe neighborhood" is a well-documented racial proxy. "Walking distance to shops" implicates disability. A model instructed to be helpful and to avoid discrimination will still write all three, because they sound welcoming rather than exclusionary. The architecture must assume generation produces violations and catch them structurally.

**Compliance as an optional QA step.** Any step that can be skipped will be skipped — by a rushed workflow, a client asking to move faster, or an operator under deadline. The one check whose failure mode is legal cannot be the one that is skippable.

**Human review only.** Does not scale to 15,000 publications a year, and humans miss the subtle proxies more often than a lexicon does.

**Post-publication monitoring.** The violation has already been published. In advertising law, publication *is* the harm.

## Consequences

`qa.compliance` runs on the `deep` model tier and is ~29% of per-reel cost. That is accepted and not subject to cost optimization — it is the cheapest insurance in the system.

Some legitimate content will be blocked (false positives). The repair loop gives two automated cycles, then a human decides. This asymmetry is correct: a false positive costs minutes; a false negative costs a client's license.

`compliance_block_total{client,check}` is an alerting metric. A spike means a prompt regressed and generation drifted. Phase 6 gate 6 requires that a deliberately weakened `qa.compliance` prompt is caught by the eval suite — the regression guard on the highest-risk capability in the system.

Target for compliance false negatives is **zero**. Every escape is a P1 incident and a lexicon update.
