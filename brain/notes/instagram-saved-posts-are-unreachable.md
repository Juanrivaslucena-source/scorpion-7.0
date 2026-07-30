---
title: Instagram Saved posts are unreachable
type: fact
status: open
confidence: high
source: measured
created: 2026-07-30
verified: 2026-07-30
tags: [integration, blocker]
claim: ig-saved
value: unreachable
---

No Instagram API — and therefore no Composio connector — exposes a user's Saved collection.
Verified by querying the live connection: it returns published media, profile, insights, and
tags only. This is a platform wall, not a permissions gap.

Consequence: DESIGN_DNA.md is seeded from stated preferences rather than real saved
references. Unblocking needs Instagram's "Download Your Information -> Saved" export.
