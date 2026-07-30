---
title: Supply a real AliExpress listing
type: task
status: blocked
confidence: medium
source: inferred
created: 2026-07-30
verified: 2026-07-30
tags: [blocker, dropship]
links: [no-aliexpress-connector-exists-here]
---

Blocked on Juan. The pipeline runs end to end but the example brief has null supplier data
and a placeholder checkout URL, so the audit correctly warns the page cannot take an order.
A real listing plus a Stripe or Shopify link turns it into a live product.
