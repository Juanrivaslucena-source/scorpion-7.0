---
title: Overnight work belongs in CI, not agent loops
type: decision
status: open
confidence: high
source: measured
created: 2026-07-30
verified: 2026-07-30
tags: [ops, budget]
links: [runway-is-roughly-25-in-credits]
---

The agent cannot run autonomously: it executes per turn and stops when the session ends.
Looping it overnight would spend the runway unsupervised.

.github/workflows/verify.yml runs the tests, example generation, and audit gate on every
push and daily at 08:00 UTC — no session, no cost.
