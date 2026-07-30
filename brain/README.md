# 🧠 Second brain

Durable memory for the Scorpion project. Plain markdown notes, a zero-dependency
CLI over them, and integrity checks that run in CI without a session.

**Why it exists:** an agent session has no memory of the last one, and re-reading
a long chat to recover context is the single largest cost driver in this project
(54% of spend was above 150k context). Knowledge lives here instead. Sessions can
reset often and cheaply, because [`BOOT.md`](./BOOT.md) restores the context in
one read.

```bash
npm run brain:brief    # regenerate BOOT.md — the context a session loads
npm run brain:recall "why no angel raise"
npm run brain:review   # integrity: contradictions, stale, lint, orphans
npm run brain:stats
```

## The honest part

**This is not an autonomous agent.** It cannot think while you sleep. What is
genuinely autonomous is its *maintenance*: CI runs `brain review --strict` on
every push and daily at 08:00 UTC, so contradictions, broken links, and malformed
notes fail the build with no session running and no credits spent.

The brain does not generate knowledge. It keeps knowledge trustworthy across
sessions, which is the part that was actually broken.

## Design

### Notes are files

Markdown with frontmatter, in `notes/`. Readable, diffable, greppable without
this tooling — the CLI is an accelerator, never a lock-in. Nothing is cached, so
the index can never drift from the notes.

```markdown
---
title: Pricing: $300-400 per month
type: decision
confidence: high
source: juan
created: 2026-07-30
verified: 2026-07-30
tags: [business, pricing]
links: [the-agency]
claim: price
value: $300-400/mo
---

Presence $300/mo, Growth $400/mo. No setup fee...
```

### Provenance is mandatory

Every note declares **where it came from** and **how much to trust it**. This is
the feature that matters: a future session must be able to tell the difference
between something Juan said, something a tool measured, and something I concluded.

| `source` | Meaning |
| --- | --- |
| `juan` | Stated directly by the operator |
| `measured` | Observed by a tool or a test |
| `external` | Read from a cited source — a URL is required |
| `inferred` | Concluded by an agent — **can never be high confidence** |

Lint enforces this. An inferred claim marked `high` is rejected at write time; an
`external` note with no URL is rejected. You cannot quietly launder a guess into a
fact.

### Knowledge decays

Notes carry a review interval by type — facts 90 days, decisions 365, tasks 30.
Past it, a note is **stale**: still readable, but marked in the brief, penalised
in ranking, and listed by `review`. `brain verify <id>` resets the clock.

### Contradictions surface

Notes may assert `claim` / `value` pairs. Two notes asserting different values for
the same claim is reported as a contradiction by `review` and printed at the top
of the brief. Knowing you contradict yourself is worth more than a tidy index.

### Recall is explainable

BM25 over title, tags, and body, then adjusted by signals a knowledge base needs:
confident notes outrank guesses, fresh outranks stale, well-connected outranks
isolated. Every result prints *why* it ranked where it did.

No embeddings, no vector database, no API call. For a few thousand notes this is
faster, free, deterministic, and auditable.

### The boot brief

`BOOT.md` is generated, never hand-edited. It leads with identity, standing
decisions, and hard constraints, then splits facts into **established** and
**unverified — treat as assumptions**, then open versus blocked work, lessons, and
brain health.

That split is the point. A brief listing only conclusions teaches the next session
to trust things it should question.

## Commands

| Command | Does |
| --- | --- |
| `capture --title T --type T --body "…"` | Add a note. Refuses to store one that fails lint. |
| `recall <query> [--type] [--tag] [--fresh]` | Ranked search with reasons |
| `show <id> [--depth N]` | Read a note plus its neighbourhood |
| `link <from> <to>` | Relate two notes |
| `verify <id>` | Mark re-checked today |
| `review [--json] [--strict]` | Integrity report; `--strict` exits non-zero — the CI gate |
| `brief [--write]` | Regenerate `BOOT.md` |
| `stats` | Inventory |

Types: `entity` · `fact` · `decision` · `insight` · `task` · `playbook`.

## Seeding

`node brain/seed.mjs` materialises the starting notes from what the project
already knows. Idempotent — existing notes are left alone, so hand edits and
re-verification survive a re-run.

## Tests

50 tests in `test/brain.test.mjs`, covering the properties that make the brain
trustworthy rather than merely functional: provenance cannot be faked,
contradictions are detected, decay works per type, backlinks derive correctly,
recall ranks sourced knowledge above inference, and the brief never presents an
inference as established.
