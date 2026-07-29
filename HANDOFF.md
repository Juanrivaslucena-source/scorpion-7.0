# HANDOFF — Scorpion project brief

> Complete state summary for an external advisor (DeepSeek) to review and issue
> direction from. Written 2026-07-29.

---

## 1. Who / what

- **Operator:** Juan. **Agent:** Scorpion (Claude Opus), acting as primary agent /
  chief executive director. Persona: JARVIS — assistant to the operator.
- **Repo:** `juanrivaslucena-source/scorpion-7.0`,
  branch `claude/website-builder-fable-agent-uugynp`. All work is committed/pushed.
- **Original goal:** an AI system that produces **websites and content** for
  clients, reasoning from three identity layers — Scorpion's, Juan's, and each
  client's.
- **Current pivot:** agency retainers are too slow to fund the operation.
  New priority is **short-form clip content monetized by platform payouts**
  ("clip farm") to generate funding. Rich media (VO/video/music) comes later.

## 2. Hard constraints

| Constraint | Detail |
| --- | --- |
| **No Instagram uploads** | Agent must never post/publish/automate to Instagram, any account. Assets are handed to Juan; he publishes. |
| **Personal account off-limits** | `@l0stindsauce` is excluded from all agency work. A separate brand account is planned but **not yet created**. |
| **Budget** | ~$25 total credits. Agent turns consume it. Opus is default; Fable 5 reserved for hero creative only (it already hit a monthly spend limit once). Local Ollama = $0, unused so far. |
| **Craftsmanship rule** | No rush; 1–2 weeks per project acceptable. Quality never traded for speed. No fabricated reviews, results, clients, or statistics. |

## 3. What has been built (all working, all committed)

| Asset | What it is | State |
| --- | --- | --- |
| `showcase/lumen.html` | **Flagship demo site** — fictional med-spa. Loader, masked kinetic type, film grain, custom cursor, scroll choreography, drag/keyboard before-after slider, generative canvas art, opt-in Web Audio ambient pad. Single file, zero external requests, full reduced-motion + a11y path. | Verified, no errors |
| `content/render.mjs` | **Content engine.** Drives a headless browser through a scripted shot list while recording 1080×1920, then transcodes to H.264 MP4. Outputs 7 postable clips + `captions.txt` with hooks. Retargetable to any site. | 7/7 render clean |
| `index.html` + `blocks.js` + `builder.js` | **Visual website builder** — 14 drag-drop blocks, undo/redo, autosave, self-contained export. | Tested green |
| `DESIGN_DNA.md` | Visual quality bar (typography, palette, spacing, motion). | **Baseline only** — see gap below |
| `org/ORG.md` | Operating model, org chart, governance, budget doctrine, positioning. | Done |
| `org/PRODUCTION.md` | Brief → finished site pipeline + craft library + blocking QA gate. | Done |
| `org/SALES.md` | $300/$400/mo offer, verticals, inbound funnel, outreach copy, objections. | Done |
| `org/BRAND.md` | Content-account kit: handles, bio, pillars, first 10 posts, cadence. | Done, unexecuted |
| `clients/_TEMPLATE.md` | CLIENT brief schema — the third identity layer. | Done, unused |
| `inbox-agent/` | SOUL / IDENTITY / USER / MEMORY for an autonomous Gmail agent. | Written, **not wired to Gmail** |
| `CLAUDE.md` | Auto-loads role, style, constraints, budget each session. | Done |

## 4. Known gaps and blockers

1. **Instagram "Saved" collection is unreachable.** No Instagram API (and thus no
   Composio connector) exposes saved posts. `DESIGN_DNA.md` is therefore seeded
   from stated preferences, **not** from Juan's actual saved design references.
   Unblock: Instagram "Download Your Information → Saved" export, or pasted links.
2. **No public URL.** The demo is not deployed. GitHub Pages is available and
   free. Blocks any link-in-bio or DM funnel.
3. **No content account.** Signup requires a phone/email — cannot be automated.
4. **No clients, no revenue, no audience.**
5. **Fable 5 unavailable** — hit a monthly spend limit.
6. **No Crunchbase connector.** CB Insights / PitchBook / Harmonic exist but are
   paid and not installed. Web search + browser automation are available free.
7. **Paid media APIs not connected** — ElevenLabs, Higgsfield, DALL·E, music gen.
   Plan was to fund them from client revenue, not the $25.

## 5. Strategic positions taken (and why)

- **No angel fundraising.** A local-SMB services business is not a venture-scale
  thesis; with zero traction it fails an angel's bar. Raising costs months and
  dilution to solve what one client solves in a week.
- **$10k/mo from agency retainers by Aug 31 was assessed as not achievable.**
  $350/mo average × ~29 clients, from zero, in 33 days. Honest projection given:
  2–4 clients, ~$1.5k–4k. Juan has accepted this and pivoted to clip content.
- **Recommended but undecided:** add a **$500–800 one-time build fee** to the
  retainer. ~3× first-month cash at the same close rate.
- **Content must be proof, not slop.** Volume is fine; fabrication is not. The
  engine mass-produces footage of real work.

## 6. The new direction — clip content for funding

Juan's read: a clip operation monetized by platform payouts is more realistic
than scaling an agency to $10k/mo. Agent has **not** yet validated or built for
this. Honest notes for the advisor:

- Platform creator payouts require eligibility thresholds (follower counts,
  watch-time minimums) that a new account does not meet on day one.
- RPM on short-form is low; revenue scales with **volume × retention**, so the
  content engine's automation is directionally right.
- Multi-platform (TikTok + YouTube Shorts) matters, since Instagram uploads are
  prohibited for the agent and YouTube/TikTok are not yet connected.
- **Unresolved:** what the clips are *about*. The current engine only renders
  website-craft footage. A doomscroll-monetized farm implies a different content
  category entirely — that decision has not been made.

## 7. Open decisions for the advisor

1. **Content category** for the clip operation — the single biggest unknown.
2. Deploy the demo to GitHub Pages? (free, unblocks everything downstream)
3. Adopt the hybrid pricing (one-time fee + retainer)?
4. Priority order: clip farm vs. landing client #1 vs. finishing the builder.
5. Whether to stand up local Ollama to move bulk work off paid credits.
6. Whether to pursue the Instagram Saved export so `DESIGN_DNA` reflects real taste.

## 8. Capabilities available to the agent

**Connected:** GitHub, Composio (web search, browser automation, Instagram *read*,
Gmail, Drive, Docs, Sheets, Notion, Canva, Perplexity), Figma, Supabase,
headless Chromium + full ffmpeg (video render/transcode).

**Not connected:** TikTok, YouTube, ElevenLabs, Higgsfield, DALL·E, Crunchbase,
Webflow (org-authorized but disabled in chat), Lovable, Netlify, Vercel.

**Cannot do:** post to Instagram (prohibited), create accounts, verify handle
availability, watch Instagram video content, read Instagram Saved items.
