---
title: Test what you ship, not what you wrote
type: insight
status: open
confidence: high
source: measured
created: 2026-07-30
verified: 2026-07-30
tags: [lesson, engineering]
---

content/render.mjs had a Lumen-hardcoded shot list. Pointed at a product page it would have
recorded seven near-identical still frames and reported success. Nothing caught it because
the check only asserted that files appeared.

Shots now declare a needs selector and a role; the engine probes the page and skips what is
absent. Assert on the content of the artefact, never on its existence.
