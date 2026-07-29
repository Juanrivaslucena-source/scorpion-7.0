# PRODUCTION — how Scorpion builds a client site

> The core product. Input: a filled `clients/«slug».md`. Output: a
> client-ready site at the quality bar in `showcase/lumen.html`.
> Reference implementation: **Lumen Aesthetic Studio** — read it before every
> build; it is the standard, not a template to clone verbatim.

## Inputs (read in this order, every build)

1. `inbox-agent/SOUL.md` — character, voice, hard stops
2. `org/ORG.md` — positioning, pricing, craftsmanship doctrine
3. `DESIGN_DNA.md` — the visual bar
4. `clients/«slug».md` — **this client** (drives every decision)

Conflict rule: SOUL > client taste > our defaults. Never ship something that
violates SOUL to satisfy a client whim; talk them out of it instead.

## The pipeline

### 1 · Intake
Fill the CLIENT brief. Batch every `«unknown»` into **one** set of questions.
Never invent reviews, credentials, results, prices, or statistics.

### 2 · Strategy (before any pixel)
Answer in writing, in the brief:
- What is the **one action** this page must produce?
- What does the visitor **fear**, and how does the page dissolve it?
- What is the **one sentence** that makes them stay past the first screen?
Layout follows this. Not the other way around.

### 3 · Art direction
Pick a **register** from the CLIENT brief and commit to it. Choose:
- Palette: ink + paper + **one** accent. No rainbow.
- Type: one display face, one text face. Tight tracking on display
  (`-.02` → `-.03em`), generous line-height on body (1.6–1.8).
- Motion character: calm / cinematic / energetic.
- Imagery: real photos if supplied; otherwise **generative canvas art**
  (see craft library) — never fake stock that implies false results.

### 4 · Build
Single self-contained HTML file. Zero external requests. Hand-written CSS/JS.
Work through the craft library below, choosing what serves *this* client.

### 5 · QA (blocking — nothing ships red)
Run the headless check. All must pass:
- No console or page errors.
- No horizontal scroll at 390px.
- Every interactive element keyboard-reachable, visible focus ring.
- Full `prefers-reduced-motion` path — site is complete and calm with motion off.
- Contrast AA on all text.
- Semantic landmarks, real `alt` text, labelled controls.
- Loads and works offline (no external fetch).

### 6 · Handoff
Deliver the file + a short note: what was built, what decisions were made and
why, what we still need from them. Then the monthly retainer work begins.

## Craft library (built and proven in Lumen)

Techniques available on every build. Use what the client needs; restraint is
part of the bar.

| Technique | Where it earns its place |
| --- | --- |
| **Percentage loader + curtain reveal** | Premium register; buys time to paint canvas art |
| **Masked kinetic type** (`overflow:hidden` + `translateY(105%)`) | Hero entrance with weight |
| **Animated film grain** (canvas tile, ~16fps) | Kills digital flatness; makes dark palettes filmic |
| **Custom cursor w/ lerp + hover swell** | Desktop luxury cue; hide on coarse pointers |
| **Scroll-reveal choreography** (IO + stagger delays) | Rhythm and pacing down the page |
| **Clip-path image wipes** | Editorial reveal, cheaper than video |
| **Generative canvas art** (gradient + blooms + contour lines + grain) | Bespoke visuals, no stock, no API cost |
| **Drag/keyboard before-after slider** | Proof-driven verticals (aesthetics, dental, reno, detailing) |
| **Marquee** | Service breadth without a wall of text |
| **Editorial index rows** (hover slide + gradient sweep) | Service menus that feel designed, not listed |
| **Web Audio ambient pad + UI ticks** | Emotional depth. **Opt-in, off by default, always.** |
| **Aura blurs** (radial gradient + blur) | Depth and warmth behind type |

### Hard craft rules
- **Sound is never autoplay.** Off by default, one obvious toggle, created only
  on a user gesture.
- **Motion is enhancement, never load-bearing.** Reduced-motion must yield a
  complete, still, beautiful page.
- **No external requests.** Fonts system-stacked, images generative or supplied,
  scripts inline. It must work on a bad connection in a salon back office.
- **No fake proof.** No invented reviews, ratings, before/afters, or numbers.
- **Performance is a feature.** One file, no frameworks, no layout shift.

## Reusable engine (roadmap)

Lumen is the hand-built reference. Next: extract it into a parameterized recipe
so a filled CLIENT brief maps to palette / type / motion / section set, and the
build becomes assembly + bespoke touches rather than from scratch. That is the
"fully functional" state — Juan states a need, Scorpion produces the site.

Sequence: (1) reference build ✅ → (2) extract tokens + section library →
(3) brief-driven assembly → (4) paid AI media modules (VO, video, imagery) once
client revenue funds them.
