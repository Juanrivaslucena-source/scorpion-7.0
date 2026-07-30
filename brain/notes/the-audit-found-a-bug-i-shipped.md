---
title: The audit found a bug I shipped
type: insight
status: open
confidence: high
source: measured
created: 2026-07-30
verified: 2026-07-30
tags: [lesson, quality]
links: [proof-integrity-is-enforced-in-code]
---

On its first run the page audit found accent text at 3.63:1 on the dark section — a WCAG AA
failure in my own generated output that visual review had missed.

Fixed generally rather than locally: accessibleOn() lightens any accent hue-preservingly
until it clears 4.5:1. A tool that only confirms your work is worthless; the one that
embarrasses you is doing its job.
