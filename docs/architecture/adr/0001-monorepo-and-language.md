# ADR-0001 — New `agency/` TypeScript workspace; audit tool untouched

**Status:** Accepted (Phase 1) · **Date:** 2026-08-04

## Context

`scorpion-7.0` is a zero-dependency CommonJS design-audit CLI. `tests/dependency-check.js` fails the build if any runtime dependency appears in `package.json`. The agency OS needs an LLM SDK, a Postgres driver, a queue library, and a validation library — every one of which that check would reject.

## Decision

An npm-workspaces monorepo at `agency/`, in TypeScript with `strict: true`, with real dependencies. The design-audit tool stays at the repository root, unchanged, and keeps its zero-dependency guarantee. `tests/dependency-check.js` reads `process.cwd()/package.json` and is therefore already scoped to the root package; Phase 2 adds an explicit assertion so the scoping is intentional rather than incidental.

The audit engine is reused, not rebuilt: `packages/connectors/audit-adapter` wraps `AuditEngine` to implement `websites.accessibility-qa` and the web half of `qa.visual`.

## Alternatives rejected

**Keep zero-dependency CommonJS.** No LLM SDK, no DB driver, no queue, no schema validation, no test framework. Hand-rolling all of that is months of work reproducing solved problems, and it would make the system harder to maintain, not simpler. The zero-dep rule is right for a CLI that must run without `npm install`; it is wrong for a multi-tenant SaaS.

**Convert the repo root.** Cleaner naming, but it rewrites the existing tool's identity and scripts for no functional gain, and it discards a working, tested, genuinely reusable audit engine.

**Separate repositories.** Loses the reuse of `lib/rules/*` across a repo boundary and adds release coordination for a team that does not need it yet.

## Consequences

Two module systems and two dependency policies live in one repository. That is a small, well-marked cost — the boundary is a directory — and it buys reuse of ~1,000 lines of tested audit logic plus an untouched, still-working tool.
