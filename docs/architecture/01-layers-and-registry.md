# 01 — Layers and Capability Registry

99 capabilities across 12 layers. Every capability has a globally unique id of the form `<layer>.<name>`, appears exactly once, and owns exactly one responsibility.

**Kind legend:** `A` = agent (makes a model call) · `C` = connector (deterministic, no model call) · `H` = hybrid (deterministic tool + model interpretation)

**Totals:** 57 agents · 23 connectors · 19 hybrids

| Layer | Count | A | C | H |
|---|---|---|---|---|
| executive | 6 | 4 | 2 | 0 |
| intake | 10 | 8 | 0 | 2 |
| strategy | 7 | 6 | 0 | 1 |
| writing | 14 | 13 | 0 | 1 |
| creative | 8 | 5 | 0 | 3 |
| video | 10 | 7 | 1 | 2 |
| publishing | 8 | 0 | 8 | 0 |
| analytics | 7 | 2 | 1 | 4 |
| sales | 8 | 4 | 2 | 2 |
| websites | 7 | 4 | 2 | 1 |
| automation | 8 | 1 | 7 | 0 |
| qa | 6 | 3 | 0 | 3 |
| **total** | **99** | **57** | **23** | **19** |

Roughly a quarter of the system makes no model call at all. That is the point.

The machine-readable source of truth is [`agency/registry/catalog.yaml`](../../agency/registry/catalog.yaml). This document is the human-readable view. CI asserts the two agree.

---

## Layer 1 — Executive (6)

Coordination and account-level judgment. Note that this layer *decides*; it does not execute — execution belongs to the Orchestrator.

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `exec.ceo` | A | Set quarterly account direction and approve/reject strategy shifts that exceed a materiality threshold. Escalation target of last resort. | `analytics.performance-reporter` |
| `exec.delivery-planner` | A | Decompose an unrecognized client request into a proposed task DAG. Returns a plan; never executes it. *(Was "Project Manager" — renamed to avoid duplicating the Orchestrator.)* | registry catalog |
| `exec.operations-manager` | A | Triage failed and `needs_human` tasks; assign remediation or escalate. Owns the exception queue, not the happy path. | — |
| `exec.client-success` | A | Assess account health from delivery + engagement signals; produce retention actions and check-in agendas. | `analytics.performance-reporter`, `exec.crm-manager` |
| `exec.crm-manager` | C | CRUD over client, contact, and interaction records. Typed reads/writes only — holds no opinions. | `automation.database-manager` |
| `exec.scheduling-manager` | C | Own the account calendar: availability, bookings, reminders, timezone resolution. | `automation.notification` |

---

## Layer 2 — Client Intake (10)

Runs once per client at onboarding, producing the durable profile every downstream agent reads. Expensive, deep, and cached forever.

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `intake.lead-qualification` | A | Score an inbound lead against ICP fit and budget signals; return qualify/disqualify with reasons. | — |
| `intake.discovery` | A | Convert a discovery call transcript or intake form into structured business facts. | — |
| `intake.brand-extraction` | A | Derive brand guidelines — voice, tone, vocabulary, forbidden words, visual identity — from existing client material. | `intake.discovery` |
| `intake.business-research` | H | Research the client's market, price bands, and inventory from public sources. *(tool: web search)* | `intake.discovery` |
| `intake.competitor-research` | H | Identify and profile 5–10 competing agents in the client's geography and analyze their content posture. *(tool: web search, social scrape)* | `intake.business-research` |
| `intake.audience-research` | A | Define the client's audience segments — demographics, life stage, motivations, objections. | `intake.business-research` |
| `intake.content-audit` | A | One-time historical review of the client's existing content: what exists, what performed, what to retire. | `analytics.collector` |
| `intake.offer-analysis` | A | Articulate what the client actually sells (listing services, buyer representation, relocation) and at what terms. | `intake.discovery` |
| `intake.usp-builder` | A | Produce a defensible unique selling proposition from offer + competitor + audience inputs. | `intake.offer-analysis`, `intake.competitor-research`, `intake.audience-research` |
| `intake.avatar-builder` | A | Build 2–4 named buyer/seller avatars with objections, triggers, and language patterns. | `intake.audience-research` |

---

## Layer 3 — Strategy (7)

Decides *what* to make. Never writes the thing.

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `strategy.marketing` | A | Set the account-level marketing thesis for a period: positioning, channel mix, budget split. | `intake.usp-builder`, `intake.avatar-builder` |
| `strategy.content` | A | Convert the marketing thesis into content pillars and a themed brief list for a period. | `strategy.marketing` |
| `strategy.campaign-planner` | A | Sequence briefs into campaigns with a narrative arc, timing, and success metrics. | `strategy.content` |
| `strategy.growth` | A | Identify the current growth constraint (reach, conversion, retention) and prescribe the lever. | `analytics.growth-predictor` |
| `strategy.platform` | A | Translate a brief into per-platform format constraints, ratios, lengths, and native conventions. | `strategy.content` |
| `strategy.trend-analyst` | H | Surface currently-rising formats, audio, and topics relevant to the client's niche. *(tool: trends API, platform APIs)* | — |
| `strategy.seo` | A | Keyword and topic strategy: cluster selection, search intent, priority. Input to writing. | `intake.business-research` |

---

## Layer 4 — Writing (14)

Each capability writes exactly one artifact type. Nothing here decides strategy; nothing here designs.

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `writing.hook-writer` | A | Opening lines for short-form video and posts. Returns ranked candidates, nothing else. | `strategy.content` |
| `writing.script-writer` | A | Spoken-word scripts for video, timed to a target duration. | `writing.hook-writer` |
| `writing.story-writer` | A | Narrative long-form pieces (case studies, client stories, neighborhood features). | `strategy.content` |
| `writing.carousel-writer` | A | Slide-by-slide copy for multi-slide carousels. | `strategy.content` |
| `writing.caption-writer` | A | Post captions for a given platform and asset. | `writing.script-writer` |
| `writing.cta-writer` | A | Calls to action, matched to funnel stage and platform affordance. | `strategy.campaign-planner` |
| `writing.email-writer` | A | Email bodies for nurture, newsletter, and transactional sequences. | `strategy.campaign-planner` |
| `writing.landing-page-copy` | A | Landing page copy blocks: hero, proof, objection, close. | `intake.usp-builder` |
| `writing.ad-copy` | A | Paid ad copy variants within platform character and policy limits. | `strategy.campaign-planner` |
| `writing.headline-generator` | A | Headlines for articles, ads, and pages. | — |
| `writing.title-generator` | A | Video and episode titles optimized for the destination platform. | `strategy.seo` |
| `writing.description-generator` | A | Long-form descriptions (YouTube, listing, page meta description). | `strategy.seo` |
| `writing.hashtag-generator` | A | Hashtag sets sized and mixed by reach tier for a given platform. | `strategy.platform` |
| `writing.keyword-generator` | H | Keyword candidates with volume and difficulty. *(tool: keyword API)* | `strategy.seo` |

---

## Layer 5 — Creative (8)

Visual direction and asset generation. `Visual QA` was listed here in the brief; it is deduplicated into the QA layer.

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `creative.director` | A | Set the creative concept for a brief: the visual idea, not the execution. | `strategy.content` |
| `creative.brand-director` | A | Enforce and evolve visual brand identity: palette, type, logo usage, treatment rules. | `intake.brand-extraction` |
| `creative.thumbnail-designer` | H | Thumbnail composition and generation. *(tool: image generation)* | `creative.director` |
| `creative.graphic-designer` | H | Static graphics: quote cards, stat cards, listing cards. *(tool: image generation)* | `creative.brand-director` |
| `creative.carousel-designer` | H | Visual layout for carousel slides, paired to carousel copy. *(tool: image generation)* | `writing.carousel-writer` |
| `creative.image-prompt-engineer` | A | Convert a creative concept into a precise image-generation prompt. Produces text, not images. | `creative.director` |
| `creative.video-prompt-engineer` | A | Convert a shot into a precise video-generation prompt. Produces text, not video. | `video.shot-planner` |
| `creative.motion-director` | A | Specify motion language: pacing, camera movement, kinetic type behavior. | `creative.director` |

---

## Layer 6 — Video Production (10)

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `video.shot-planner` | A | Break a script into a numbered shot list with intent per shot. | `writing.script-writer` |
| `video.storyboard` | A | Describe each shot's framing and composition as a storyboard entry. | `video.shot-planner` |
| `video.higgsfield-prompt` | A | Produce Higgsfield-specific generation prompts and parameters. Vendor-specific by design, so the vendor is swappable in one place. | `creative.video-prompt-engineer` |
| `video.broll-planner` | A | Specify supporting B-roll per shot, with sourcing instructions. | `video.shot-planner` |
| `video.editing-planner` | A | Produce the edit decision plan: cut points, ordering, pacing. | `video.storyboard` |
| `video.transitions` | A | Specify transitions between cuts and their timing. | `video.editing-planner` |
| `video.subtitle` | H | Generate and time-align captions. *(tool: ASR)* | `writing.script-writer` |
| `video.sound-design` | A | Specify sound effects and audio treatment per beat. | `video.editing-planner` |
| `video.music-selector` | H | Select licensed music matched to mood, pacing, and platform rights. *(tool: music catalog API)* | `creative.motion-director` |
| `video.final-export-qa` | C | Verify the exported file: codec, resolution, aspect, duration, loudness, file size. *(ffprobe — deterministic)* | — |

---

## Layer 7 — Publishing (8)

Almost entirely deterministic. This is where hallucination would be most expensive, so nothing here reasons.

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `publishing.formatter` | C | Transform a finished asset + copy into the exact payload shape a target platform requires. | `strategy.platform` |
| `publishing.scheduler` | C | Resolve a publish time from calendar, cadence rules, and timezone; enqueue the publish job. | `exec.scheduling-manager` |
| `publishing.instagram` | C | Publish to Instagram. | secrets service |
| `publishing.tiktok` | C | Publish to TikTok. | secrets service |
| `publishing.youtube-shorts` | C | Publish to YouTube Shorts. | secrets service |
| `publishing.facebook` | C | Publish to Facebook. | secrets service |
| `publishing.linkedin` | C | Publish to LinkedIn. | secrets service |
| `publishing.pinterest` | C | Publish to Pinterest. | secrets service |

Each publisher is one file implementing the same `Publisher` interface (`publish`, `delete`, `getStatus`, `refreshAuth`). Adding a platform is adding one file and one catalog row.

---

## Layer 8 — Analytics (7)

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `analytics.collector` | C | Pull raw metrics from platform APIs on a schedule and write them to the metric tier. No interpretation. | secrets service |
| `analytics.performance-reporter` | H | Turn metrics into a client-readable narrative report. *(tool: metric query)* | `analytics.collector` |
| `analytics.content-reviewer` | A | Per-post retrospective: what worked, what didn't, what to reuse. Recurring, post-publication. | `analytics.collector` |
| `analytics.ab-testing` | H | Design variant tests and call winners with a stated significance rule. *(tool: metric query)* | `analytics.collector` |
| `analytics.optimization` | A | Convert review findings into concrete changes to briefs, hooks, or cadence. | `analytics.content-reviewer` |
| `analytics.trend-tracker` | H | Track performance trajectory of the client's own content over time. *(tool: metric query)* | `analytics.collector` |
| `analytics.growth-predictor` | H | Forecast reach and follower trajectory with an explicit confidence interval. *(tool: metric query)* | `analytics.trend-tracker` |

`analytics.optimization` writes winning hooks and scripts back into the semantic memory tier. This is the system's learning loop — the mechanism by which output quality improves with account age.

---

## Layer 9 — Sales (8)

Agency-side sales: winning and billing real estate clients.

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `sales.prospect-finder` | H | Find and rank agents matching the ICP. *(tool: web search, directory APIs)* | — |
| `sales.cold-calling-assistant` | A | Produce call talk tracks, objection handling, and post-call summaries. Does **not** dial. | `intake.lead-qualification` |
| `sales.cold-email` | A | Write cold outbound email sequences. | `sales.prospect-finder` |
| `sales.follow-up` | A | Write stage-appropriate follow-ups from pipeline state. | `sales.pipeline-manager` |
| `sales.proposal-writer` | A | Write scoped proposals with deliverables and pricing. | `intake.lead-qualification` |
| `sales.contract-generator` | H | Assemble contracts from approved clause templates; flag any non-standard clause for human review. *(tool: template store)* | `sales.proposal-writer` |
| `sales.invoice` | C | Generate and issue invoices; track payment state. Pure arithmetic and templating. | `automation.database-manager` |
| `sales.pipeline-manager` | C | Own deal stage transitions as an explicit state machine. | `exec.crm-manager` |

`sales.contract-generator` is deliberately hybrid and deliberately conservative: assembly is templated, and anything off-template escalates to a human. Generative contract drafting is a liability the architecture declines to take on.

---

## Layer 10 — Websites (7)

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `websites.planner` | A | Define site structure: pages, hierarchy, conversion paths. | `intake.usp-builder` |
| `websites.designer` | A | Specify layout and component composition per page. | `creative.brand-director` |
| `websites.copy` | A | Write on-page copy against the page spec. | `writing.landing-page-copy` |
| `websites.seo-implementation` | A | Implement on-page SEO: meta tags, schema.org markup, sitemaps, internal linking. *(Distinct from `strategy.seo`, which chooses the targets.)* | `strategy.seo` |
| `websites.accessibility-qa` | C | Audit rendered pages for WCAG AA contrast, overflow, oversized icons, and text collision. **Wraps the existing `lib/audit-engine.js` — reused, not rebuilt.** | — |
| `websites.performance-optimizer` | H | Measure Core Web Vitals and recommend fixes. *(tool: Lighthouse)* | — |
| `websites.deployment` | C | Deploy a built site to its host and report the resulting URL and status. | secrets service |

---

## Layer 11 — Automation (8)

Plumbing. Almost entirely connectors — these are the system's hands.

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `automation.workflow-builder` | A | Author and validate new workflow DAG definitions from a described process. | registry catalog |
| `automation.zapier` | C | Trigger and manage Zapier zaps. | secrets service |
| `automation.n8n` | C | Trigger and manage n8n workflows. | secrets service |
| `automation.api-manager` | C | Outbound HTTP with per-vendor auth, retry, rate limiting, and circuit breaking. Every external call goes through here. | secrets service |
| `automation.webhook-manager` | C | Register, verify, and dispatch inbound/outbound webhooks. | — |
| `automation.database-manager` | C | Schema and migration operations. *(Narrowed from the brief to avoid overlapping the memory service.)* | — |
| `automation.notification` | C | Deliver notifications across email, SMS, Slack, and push. | secrets service |
| `automation.file-storage` | C | Object storage operations for media assets: put, get, sign, expire. | secrets service |

> `automation.file-storage` was not in the original brief but is required — video and image capabilities produce large binaries that cannot live in Postgres or in a task payload. Flagged as an addition rather than smuggled in.

The brief's **Memory Manager** is not here. Memory is infrastructure used by every capability, so it cannot be one capability's responsibility. See [04-memory.md](04-memory.md).

---

## Layer 12 — Quality Assurance (6)

Every QA capability is **fail-closed**: an error verdict blocks progression. None of them can be skipped by a workflow that publishes.

| id | kind | Single responsibility | Depends on |
|---|---|---|---|
| `qa.fact-checker` | H | Verify factual claims — prices, dates, statistics, market figures. *(tool: web search, metric query)* | — |
| `qa.grammar` | H | Grammar, spelling, and readability. *(tool: deterministic linter, then model review)* | — |
| `qa.brand` | A | Verify adherence to the client's voice, tone, vocabulary, and forbidden-word list. | `intake.brand-extraction` |
| `qa.visual` | H | Verify visual output. Web surfaces use the deterministic audit engine; images and video use a vision model. *(Deduplicated — was listed in both Creative and QA.)* | `creative.brand-director` |
| `qa.compliance` | A | Verify Fair Housing language, required license/brokerage attribution, disclosure requirements, and asset usage rights. **Non-bypassable publish gate.** | `intake.discovery` |
| `qa.final-approval` | A | Aggregate all QA verdicts into a single release decision. The only capability permitted to mark an asset publishable. | all `qa.*` |

---

## Registry mechanics

**Loading.** At boot, `packages/registry` walks `agency/agents/**/agent.yaml`, validates each against `agent-manifest.schema.json`, and builds an immutable in-memory map. A single invalid manifest fails startup — there is no partial-registry mode.

**Lints, run in CI:**
1. Capability ids are unique and match `^[a-z]+\.[a-z0-9-]+$`.
2. Every `dependencies` entry resolves to a real capability id.
3. The dependency graph is acyclic.
4. No two capabilities in the same layer declare the same `outputs.$id` (the duplicate-responsibility check).
5. Every capability in `catalog.yaml` has a manifest directory, and vice versa.
6. Every `agent` and `hybrid` has at least one fixture; every `connector` has at least one contract test.
7. No prompt file exceeds its configured token budget (Rule 1's guard against creeping monoliths).

**Resolution.** Capabilities are resolved by id and semver range: `registry.resolve('writing.hook-writer', '^3.0.0')`. Two major versions may run concurrently, which is what makes prompt rollouts safe — see [06-infrastructure.md](06-infrastructure.md).

**Replaceability.** Because callers depend only on a capability's id and its I/O schemas, any capability can be swapped for a different implementation — a different prompt, a different model, a different vendor, or a human in the loop — without touching a single caller. This is the property that makes the "1 to 500 clients without redesign" claim credible.
