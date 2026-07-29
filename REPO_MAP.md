# REPO MAP — scorpion-7.0

> Every file in the repository, what it is, and why it exists.
> Companion to `HANDOFF.md` (project state, blockers, open decisions).
> Read this to know **what exists**; read HANDOFF to know **where things stand**.
>
> Repo: `juanrivaslucena-source/scorpion-7.0`
> Branch: `claude/website-builder-fable-agent-uugynp` · 21 files · ~3,100 lines
> Written 2026-07-29.

---

## Directory structure

```
scorpion-7.0/
├── CLAUDE.md              agent boot context — auto-loads every session
├── HANDOFF.md             project state brief (for advisors)
├── REPO_MAP.md            this file
├── README.md              website builder docs
├── DESIGN_DNA.md          visual quality bar
│
├── index.html             ┐
├── styles.css             │ the website builder app
├── blocks.js              │ (drag-drop editor, exports standalone sites)
├── builder.js             ┘
│
├── showcase/
│   └── lumen.html         flagship demo site — the quality proof
│
├── content/
│   └── render.mjs         content engine — renders vertical clips from a site
│
├── clients/
│   └── _TEMPLATE.md       client brief schema (third identity layer)
│
├── org/
│   ├── ORG.md             operating model, org chart, governance
│   ├── PRODUCTION.md      brief → finished site pipeline
│   ├── SALES.md           offer, pricing, funnel, outreach
│   └── BRAND.md           content account kit
│
└── inbox-agent/
    ├── SOUL.md            agent character, voice, hard stops
    ├── IDENTITY.md        agent capabilities and playbook
    ├── USER.md            profile of the operator
    ├── MEMORY.md          learning-loop journal
    └── README.md          how the identity files fit together
```

---

## 1 · Governance & context

### `CLAUDE.md` — 38 lines
Boot file. Auto-loads into the agent every session so context never has to be
re-typed (token discipline). Contains: role, which files to read first, the
fixed business model, **standing constraints** (never upload to Instagram;
personal account off-limits; JARVIS persona), response style, budget rules,
git branch. **Highest-authority operational file.**

### `HANDOFF.md` — 110 lines
Full project state for an external advisor: what's built, hard constraints,
known blockers, strategic positions taken and why, the clip-content pivot, open
decisions, and the agent's current capabilities. **Start here for status.**

### `REPO_MAP.md` — this file
File-by-file inventory.

---

## 2 · Strategy (`org/`)

### `org/ORG.md` — 138 lines
The company operating system. Mission; **positioning & pricing** (deliver work
others charge $3–4k for, at $300–400/mo, to local small businesses);
**pace & craftsmanship** (1–2 weeks per project, quality never traded for
speed); the org chart (Juan → Scorpion as CEO → Build/Creative/Growth/Ops
managers → on-demand workers); how work flows; **governance** (hard stops,
budget discipline, quality bar, truthfulness); capital-efficiency doctrine;
honest limits.

### `org/PRODUCTION.md` — 97 lines
How a client brief becomes a finished site. Input order and conflict rule,
strategy-before-pixels, art direction, the **craft library** extracted from the
Lumen build (12 techniques with when to use each), hard craft rules (sound never
autoplays, motion never load-bearing, no external requests, no fake proof), and
a **blocking QA gate**. Roadmap toward a brief-driven assembly engine.

### `org/SALES.md` — 164 lines
The offer ($300 Presence / $400 Growth, no setup fee, month-to-month), target
verticals and qualification, the **inbound acquisition engine** (content →
keyword trigger → auto-DM → qualify → call) with Meta compliance rules, the
account policy, outbound prospecting as secondary, outreach copy in the agent's
voice, call structure, objection handling, and the 3-client funding path.

### `org/BRAND.md` — 104 lines
Kit for a dedicated content account (separate from anything personal). Handle
options, profile copy, content pillars, format rules, the first 10 posts specced
against Lumen, cadence, growth mechanics in strict order, and the four setup
steps only Juan can perform.

---

## 3 · Identity layers (`inbox-agent/`, `clients/`)

Three layers reason together to produce client work:
**SOUL** (how the agent works) + **USER** (the agency's standards) +
**CLIENT** (this business).

### `inbox-agent/SOUL.md` — 101 lines
Character and values. Priority order: protect the principal → **craftsmanship
over speed** → decisive but never sloppy → truthful → discreet → learn in the
open. **Voice spec:** concise, direct, zero corporate fluff; calm, reassuring,
never pushy or salesy; no filler openers; when unsure, flags — never guesses.
**Hard stops** (escalate, never act alone): money, legal/binding,
irreversible/destructive, high-stakes unknowns, sensitive people, credentials.
Reversibility rule. The learning loop. Governs every agent in the org.

### `inbox-agent/IDENTITY.md` — 93 lines
What the agent does: capabilities, label taxonomy, per-message decision
playbook, autopilot guardrails, daily digest, escalation format.

### `inbox-agent/USER.md` — 66 lines
Profile of Juan. Confirmed facts plus explicitly marked `«fill»` placeholders
(name/signature, Gmail address, timezone, VIP and sensitive contacts, the
escalate-vs-auto split). **Incomplete by design** — unknowns are never invented.

### `inbox-agent/MEMORY.md` — 22 lines
Journal powering the learning loop. Entry format defined; **log empty** — the
agent has not run operationally.

### `clients/_TEMPLATE.md` — 74 lines
The CLIENT brief schema. Eight sections: business, conversion economics,
audience, brand voice, visual direction, content inventory, scope, constraints.
Copy per client. **Unused — no clients yet.**

---

## 4 · Product: the website builder

Browser-based drag-and-drop editor. Zero dependencies, no build step. Open
`index.html`.

| File | Lines | Role |
| --- | --- | --- |
| `index.html` | 57 | App shell — top bar, palette, canvas, preview modal |
| `styles.css` | 202 | Editor chrome styling |
| `blocks.js` | 363 | **14 block definitions + `BLOCK_CSS`** — the content design system, shared by editor and export so preview never drifts from output |
| `builder.js` | 491 | Runtime — drag/drop, inline editing, undo/redo history, autosave, export, preview |

**Blocks:** nav bar, hero, split, heading, text, features, logo strip, stats,
image, gallery, quote, pricing, CTA, footer.
**Features:** inline text editing, editable image URLs and button links,
reorder/duplicate/delete, undo/redo (`Ctrl/Cmd+Z`), localStorage autosave, live
preview, export to one self-contained HTML file with inline SVG placeholders and
a reduced-motion-aware scroll-reveal script.

### `README.md` — 63 lines
User-facing docs for the builder: features, how to run, file roles, how export
works, roadmap.

### `DESIGN_DNA.md` — 77 lines
The visual bar: design posture, typography, color, layout, motion, imagery,
CTAs, engineering standards. **Status: baseline v0** — seeded from stated
preferences, *not* from Juan's real Instagram saved references, because no
Instagram API exposes saved items. Needs the "Download Your Information → Saved"
export to become v1.

---

## 5 · Proof: the flagship demo

### `showcase/lumen.html` — 565 lines, 32K
A complete fictional med-spa site ("Lumen Aesthetic Studio"). **This is the
quality standard the agency sells against** — the reference implementation for
`PRODUCTION.md`.

Craft: percentage loader + curtain reveal · masked kinetic hero type · animated
film-grain canvas · magnetic custom cursor · scroll-reveal choreography ·
clip-path wipes · **generative canvas art** (gradient + blooms + contour lines +
grain — no stock photography) · **drag/keyboard before-after slider** · marquee ·
editorial service index · membership tiers · **opt-in Web Audio ambient pad**
(4 detuned oscillators, LFO-modulated, lowpass) + UI hover ticks.

Standards met: single file, **zero external requests**, no frameworks, semantic
landmarks, visible focus rings, ARIA slider with arrow-key control, complete
`prefers-reduced-motion` path, no horizontal scroll at 390px, no console errors.

---

## 6 · Content engine

### `content/render.mjs` — 228 lines
Automated vertical-clip production. Drives headless Chromium through a scripted
**shot list** (loader, hero reveal, before/after drag, service hover pass, full
scroll, pricing hover, reduced-motion cut) while recording 1080×1920, then
transcodes VP8 webm → **H.264 MP4** (Playwright's bundled ffmpeg can't mux MP4,
so it locates a full ffmpeg). Emits `captions.txt` pairing each clip with hook
copy.

Run: `node content/render.mjs [site.html] [outdir]` — retargetable to any build.
Output (`content/out/`) is gitignored. **The agent renders clips; it never
uploads them.**

---

## 7 · Not in the repo

- No deployed URL (nothing hosted yet).
- No client work.
- No `package.json` — dependencies (`playwright-core`) are installed ad hoc and
  gitignored, keeping the repo dependency-free.
- No tests committed — QA runs as throwaway headless scripts.
- No CI.
- No secrets, keys, or credentials. **Nothing sensitive is stored here.**
