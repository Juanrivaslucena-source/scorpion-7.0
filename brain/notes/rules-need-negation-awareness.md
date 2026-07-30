---
title: Rules need negation awareness
type: insight
status: open
confidence: high
source: measured
created: 2026-07-30
verified: 2026-07-30
tags: [lesson, engineering]
---

The regulated-claim detector flagged the standard FTC disclaimer — "not intended to
diagnose, treat, cure, or prevent" — because it matched on the word "cure".

Both the validator and the audit now judge per sentence and understand negation. A rule that
fires on lawful text trains people to ignore it, which is worse than having no rule.
