/**
 * Seed the brain from what this project already knows.
 *
 * Run once (`node brain/seed.mjs`) to materialise the notes. Idempotent:
 * existing notes are left alone so hand edits and re-verification survive.
 *
 * Provenance is set honestly. Anything Juan said is `juan`; anything the tools
 * measured is `measured`; anything read off the web is `external` with URLs;
 * anything I concluded is `inferred` and can never be high confidence.
 */
import fs from "fs";
import path from "path";
import { write, NOTES, slugify } from "./lib/store.mjs";
import { today } from "./lib/note.mjs";

const N = [
/* ---------------------------------------------------------- entities ---- */
{ title: "Juan — founder", type: "entity", source: "juan", confidence: "high",
  tags: ["identity"], links: ["scorpion-the-agent", "the-agency"], body:
`Founder and operator. Building an AI agency plus a dropship operation from a near-zero
runway. Bilingual EN/ES. Works visually and moves fast; prefers being told the honest
constraint over being managed.

Directs Scorpion as primary agent and expects it to act rather than present plans.
Persona requested: JARVIS — assistant to the operator.` },

{ title: "Scorpion — the agent", type: "entity", source: "juan", confidence: "high",
  tags: ["identity"], links: ["juan-founder", "the-agency"], body:
`Primary agent and chief executive director for the project. Decomposes direction,
delegates, holds the quality bar and the budget, reports back in one voice.

Voice: concise, direct, zero corporate fluff. Calm, reassuring, never pushy, never salesy.
No filler openers. When unsure it flags rather than guesses. Character is defined in
inbox-agent/SOUL.md; the org model is in org/ORG.md.` },

{ title: "The agency", type: "entity", source: "juan", confidence: "high",
  tags: ["business"], links: ["pricing-300-400-per-month", "craftsmanship-over-speed"], body:
`Sells agency-quality websites and content to local small businesses. The wedge is the gap
between what a small business can afford and the quality it can normally get:
work others charge $3,000-4,000 for, priced so a small business can say yes.` },

/* ------------------------------------------------------- constraints ---- */
{ title: "Never upload to Instagram", type: "decision", source: "juan", confidence: "high",
  tags: ["constraint", "policy"], claim: "instagram-upload", value: "prohibited", body:
`The agent must never post, publish, or automate anything to Instagram — any account,
personal or brand. Assets are produced and handed to Juan; he decides what goes live.
This overrides any plan written in org/ files.` },

{ title: "Personal account is off-limits", type: "decision", source: "juan", confidence: "high",
  tags: ["constraint", "policy"], body:
`Juan's personal Instagram account is excluded from all agency work: not used for the
funnel, not referenced in outreach, not connected to automation. Agency content runs on a
separate brand account, which does not exist yet.` },

{ title: "Runway is roughly $25 in credits", type: "fact", source: "juan", confidence: "high",
  tags: ["constraint", "budget"], ttl: 14, claim: "runway", value: "~$25", body:
`Every agent turn spends from this. Consequences that follow: Opus is the default engine,
bulk work belongs on local Ollama at zero cost, Fable 5 is reserved for hero creative only,
and multi-agent fan-out must be justified before it is spent.

Long context above ~150k tokens is the single largest cost driver, which is why context
lives in files and sessions are kept short.` },

/* --------------------------------------------------------- decisions ---- */
{ title: "Fund with customers, not investors", type: "decision", source: "inferred",
  confidence: "medium", tags: ["strategy", "funding"], links: ["the-agency"], body:
`No angel raise. A local-SMB services business is not a venture-scale thesis and would fail
an angel's bar with zero traction. Raising costs months and dilution to solve what one
client solves in a week: one client at $400/mo is roughly 16x the current runway.

Juan accepted this and redirected toward content-driven revenue.` },

{ title: "Craftsmanship over speed", type: "decision", source: "juan", confidence: "high",
  tags: ["constraint", "quality"], links: ["the-agency"], body:
`No rush. One to two weeks per project is acceptable. Quality is protected first and speed
never justifies shipping mediocre work. Bias to action applies to deciding quickly, never
to shipping sloppily.` },

{ title: "Pricing: $300-400 per month", type: "decision", source: "juan", confidence: "high",
  tags: ["business", "pricing"], claim: "price", value: "$300-400/mo", links: ["the-agency"], body:
`Presence $300/mo, Growth $400/mo. No setup fee — that is the wedge against competitors who
charge $3-4k up front. Month to month, no lock-in. Target is local small businesses; big
company service at small business pricing, because the reputation for big-company pricing
has not been earned yet.` },

{ title: "Proof integrity is enforced in code", type: "decision", source: "measured",
  confidence: "high", tags: ["constraint", "legal", "quality"], links: ["dropship-pipeline"], body:
`No fabricated reviews or ratings, no manufactured urgency, no regulated health claims, no
deceptive compare-at pricing. These are not guidelines — dropship/lib/schema.mjs blocks
generation and dropship/audit.mjs blocks shipping, and both are covered by tests.

Fabricated testimonials are illegal in the US under FTC rules and are the fastest way to
lose a payment processor.` },

{ title: "Overnight work belongs in CI, not agent loops", type: "decision", source: "measured",
  confidence: "high", tags: ["ops", "budget"], links: ["runway-is-roughly-25-in-credits"], body:
`The agent cannot run autonomously: it executes per turn and stops when the session ends.
Looping it overnight would spend the runway unsupervised.

.github/workflows/verify.yml runs the tests, example generation, and audit gate on every
push and daily at 08:00 UTC — no session, no cost.` },

/* ------------------------------------------------------------- facts ---- */
{ title: "Instagram Saved posts are unreachable", type: "fact", source: "measured",
  confidence: "high", tags: ["integration", "blocker"], claim: "ig-saved", value: "unreachable", body:
`No Instagram API — and therefore no Composio connector — exposes a user's Saved collection.
Verified by querying the live connection: it returns published media, profile, insights, and
tags only. This is a platform wall, not a permissions gap.

Consequence: DESIGN_DNA.md is seeded from stated preferences rather than real saved
references. Unblocking needs Instagram's "Download Your Information -> Saved" export.` },

{ title: "No AliExpress connector exists here", type: "fact", source: "measured",
  confidence: "high", tags: ["integration", "blocker"], links: ["dropship-pipeline"], body:
`Supplier cost, rating, units sold and ship time are entered by hand from the real listing.
The dropship API requires approval; scraping is fragile and against their terms.` },

{ title: "Fable 5 hit a monthly spend limit", type: "fact", source: "measured",
  confidence: "high", tags: ["budget", "blocker"], ttl: 30, body:
`A Fable 5 review agent terminated with a hard monthly spend limit error before doing any
work. Reserve Fable 5 for hero creative only, and never for routine review.` },

{ title: "Winning-product criteria for short-form", type: "fact", source: "external",
  confidence: "medium", tags: ["dropship", "research"],
  sources: ["https://news.astools.app/en/blog/tiktok-viral-products-august-2026",
            "https://dropship-spy.com/blog/best-dropshipping-products-2026"],
  links: ["dropship-pipeline"], body:
`A product must be demonstrable in under three seconds, solve a tangible problem, and sit in
the $20-40 impulse band. Margin must clear 3x landed cost or paid acquisition eats it.
Categories with momentum: beauty and self-care, home organization, wellness.

Encoded as hard gates in dropship/research.mjs.` },

/* ---------------------------------------------------------- insights ---- */
{ title: "Test what you ship, not what you wrote", type: "insight", source: "measured",
  confidence: "high", tags: ["lesson", "engineering"], body:
`content/render.mjs had a Lumen-hardcoded shot list. Pointed at a product page it would have
recorded seven near-identical still frames and reported success. Nothing caught it because
the check only asserted that files appeared.

Shots now declare a needs selector and a role; the engine probes the page and skips what is
absent. Assert on the content of the artefact, never on its existence.` },

{ title: "The audit found a bug I shipped", type: "insight", source: "measured",
  confidence: "high", tags: ["lesson", "quality"], links: ["proof-integrity-is-enforced-in-code"], body:
`On its first run the page audit found accent text at 3.63:1 on the dark section — a WCAG AA
failure in my own generated output that visual review had missed.

Fixed generally rather than locally: accessibleOn() lightens any accent hue-preservingly
until it clears 4.5:1. A tool that only confirms your work is worthless; the one that
embarrasses you is doing its job.` },

{ title: "Rules need negation awareness", type: "insight", source: "measured",
  confidence: "high", tags: ["lesson", "engineering"], body:
`The regulated-claim detector flagged the standard FTC disclaimer — "not intended to
diagnose, treat, cure, or prevent" — because it matched on the word "cure".

Both the validator and the audit now judge per sentence and understand negation. A rule that
fires on lawful text trains people to ignore it, which is worse than having no rule.` },

{ title: "Context in files beats context in chat", type: "insight", source: "measured",
  confidence: "high", tags: ["lesson", "budget"], links: ["runway-is-roughly-25-in-credits"], body:
`Usage showed 54% of spend at over 150k context. Long threads re-read everything on every
turn. Keeping identity, decisions, and state in files lets sessions reset cheaply and often
without losing anything — which is the entire reason this brain exists.` },

/* --------------------------------------------------------- playbooks ---- */
{ title: "Dropship pipeline", type: "playbook", source: "measured", confidence: "high",
  tags: ["playbook", "dropship"], links: ["winning-product-criteria-for-short-form"], body:
`research -> brief -> page -> content -> audit. Six commands, 83 tests.

  npm run research   score and rank candidates against the hard gates
  npm run page       brief -> self-contained landing page
  npm run kit        brief -> hooks, scripts, ad copy, captions, DM script
  npm run clips      page -> vertical 1080x1920 MP4s
  npm run audit      integrity / conversion / quality gate
  npm run verify     tests + audit

Full detail in dropship/PIPELINE.md.` },

{ title: "Website production pipeline", type: "playbook", source: "measured", confidence: "high",
  tags: ["playbook", "agency"], links: ["craftsmanship-over-speed"], body:
`Client brief -> strategy -> art direction -> build -> blocking QA -> handoff.
The reference implementation is showcase/lumen.html; the craft library and QA gate are in
org/PRODUCTION.md. Nothing ships that fails accessibility, reduced-motion, or the
no-external-requests rule.` },

/* ------------------------------------------------------------- tasks ---- */
{ title: "Deploy the demo to a public URL", type: "task", source: "inferred",
  confidence: "medium", status: "open", tags: ["blocker", "growth"], body:
`showcase/lumen.html is not hosted. Without a public URL there is nothing to put in a bio
link or send in a DM, which blocks every acquisition path. GitHub Pages is free and already
connected.` },

{ title: "Create the brand content account", type: "task", source: "juan",
  confidence: "high", status: "blocked", tags: ["blocker", "growth"], links: ["personal-account-is-off-limits"], body:
`Blocked on Juan: signup needs a phone or email and cannot be automated. Handle options,
bio copy, and the first ten posts are specced in org/BRAND.md.` },

{ title: "Supply a real AliExpress listing", type: "task", source: "inferred",
  confidence: "medium", status: "blocked", tags: ["blocker", "dropship"], links: ["no-aliexpress-connector-exists-here"], body:
`Blocked on Juan. The pipeline runs end to end but the example brief has null supplier data
and a placeholder checkout URL, so the audit correctly warns the page cannot take an order.
A real listing plus a Stripe or Shopify link turns it into a live product.` },

{ title: "Complete the USER profile", type: "task", source: "inferred",
  confidence: "medium", status: "blocked", tags: ["blocker"], links: ["juan-founder"], body:
`inbox-agent/USER.md still has placeholder fields: exact sign-off, the Gmail address the
agent would run, timezone and working hours, VIP and sensitive contacts, and the
escalate-versus-auto split. Unattended sending is unsafe until these are filled.` },
];

let created = 0, skipped = 0;
for (const n of N) {
  const id = slugify(n.title);
  if (fs.existsSync(path.join(NOTES, `${id}.md`))) { skipped++; continue; }
  const { title, type, body, ...rest } = n;
  write({ title, type, created: today(), verified: today(), confidence: "medium",
          source: "juan", status: "open", ...rest }, body);
  created++;
}
console.log(`seeded ${created} note(s)${skipped ? `, ${skipped} already present` : ""}`);
