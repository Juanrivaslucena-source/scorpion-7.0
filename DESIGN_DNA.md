# 🧬 DESIGN DNA

> **Status: BASELINE (v0) — awaiting Instagram Saved-collection data.**
> This profile is seeded from the design preferences you stated directly in your
> brief. It is **not** yet derived from your Instagram Saved Reels/posts, because
> the Instagram Graph API (and therefore the Composio connector) does not expose
> a user's Saved collection — a hard platform limitation, not a permissions gap.
> When you provide your **"Download Your Information → Saved"** export or a batch
> of saved links, this file will be rewritten around the *observed* patterns and
> re-versioned (v1). Until then, every website is built against the principles
> below.

---

## 1. Design posture

Build at the level of a **high-end creative agency**, not a template factory.
Every page should feel intentional, composed, and premium. Prefer restraint and
craft over decoration. When in doubt, remove.

## 2. Typography

- **Expressive display type** for heroes and section titles — large, confident,
  tight letter-spacing (`-0.02em` to `-0.03em`), line-height near 1.05–1.1.
- **Quiet, highly legible body** — comfortable measure (60–75 chars), line-height
  1.6–1.75, slightly muted foreground (never pure black on white).
- A clear **modular type scale** (≈1.25 ratio) so sizes relate, not clash.
- Limit to **two families max**: one display, one text. Consistency reads as luxury.

## 3. Color

- **Restrained, editorial palette**: a near-black ink, a warm off-white paper,
  and **one** confident accent. Avoid rainbow UIs.
- Generous use of **negative space** as a design element in its own right.
- High contrast for text (WCAG AA+), soft contrast for surfaces.

## 4. Layout & composition

- **Unique layouts** over generic SaaS blocks — asymmetry, editorial grids,
  intentional alignment to a baseline.
- Wide, breathable **section padding**; content columns kept narrow for rhythm.
- Strong **visual hierarchy**: one clear focal point per section.

## 5. Motion & scroll

- **Subtle, tasteful motion** — fade/translate reveals as sections enter the
  viewport; nothing bouncy or gimmicky.
- Respect **`prefers-reduced-motion`** — motion is an enhancement, never required.
- Transitions are short (150–500ms) and eased, not linear.

## 6. Imagery

- Large, cinematic imagery with room to breathe; consistent treatment
  (aspect ratio, rounding, overlay) across a page.

## 7. Conversion / CTAs

- One primary CTA per view, unmistakable but not loud.
- Buttons feel physical: clear padding, confident label, real destination.

## 8. Engineering standards (non-negotiable)

- **Responsive** (mobile-first, fluid type/spacing).
- **Performant** (no heavy dependencies; static, self-contained output).
- **Accessible** (semantic HTML, alt text, focus states, AA contrast,
  reduced-motion support).
- **Clean, maintainable code** — content styles live in one place
  (`BLOCK_CSS`) so the editor preview and the exported page never drift.

---

## How this file is used

`blocks.js` (`BLOCK_CSS`) and the block templates are the concrete expression of
this profile. Changing the DNA here should be followed by aligning `BLOCK_CSS`.
When the Instagram-derived v1 lands, expect updates to: type families/scale,
the accent color, section rhythm, and motion character.
