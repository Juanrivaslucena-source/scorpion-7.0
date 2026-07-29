# Handoff — Alpha Electric media-agency pitch

**Last updated:** 2026-07-29
**Repo:** juanrivaslucena-source/scorpion-7.0
**Working branch:** `claude/first-pr-setup-ttqfio` (single consolidated branch — no separate MCP-setup branch exists)
**Open PR:** #1 — https://github.com/Juanrivaslucena-source/scorpion-7.0/pull/1
**Live dashboard:** https://claude.ai/code/artifact/463a3a5d-a20f-4bda-880d-05b5557c2c03

---

## ▶️ Next action (start here)
1. **Enable the Composio connector in the chat** (toggle inside the conversation, not the Composio dashboard). It is currently `connected: true` but `enabledInChat: false`, so its tools don't load.
2. Once its `mcp__composio__*` tools appear, run the **batch**: fetch real bike images + generate stills/clips → assemble reels/slideshows.
3. Update the dashboard checklist as pieces ship.

---

## The goal (why)
The user runs a **media agency** pitching **Alpha Electric Bikes** (Kissimmee, FL — Sur-Ron/Talaria e-moto dealer) to win **full management** (social, ads, website).
- Start: free Sur-Ron Ultra Bee + ~$350–400/mo → scale to $800–900/mo after 30–40k followers.
- **Deadline: end of week.** Lead the pitch with the website, then finished content.
- Owner contact comes via the user's friend who works there.
- Sister brand: **Alpha Volt Electric** (electronics store ~2 mi from user, carries some e-bike stock). Exact IG handle / address still TBD.

## Creative direction
- Aesthetic: **Porsche-edit look** — dreamy pastel/pink, cherry-blossom + natural light, film-grain realism (say "shot on Portra, not CGI"). Also "high-tech night" clips.
- Reels: **multiple clips, hard cuts (NO fades)**, real brand names on screen: **Sur-Ron, Talaria, Ventus, Strike, Shadow, Yozma**.
- Copy: **no pricing, no slogans** — neutral/premium so the owner can tweak.
- **Use REAL bikes**, not AI mockups, wherever possible (fetch official product photos or use user-supplied shop footage).
- User has **ADHD** — work visually, ship small verifiable wins, keep one clear next move, body-double.

## Target deliverables
Landing page ✔ · **15 reels** · **10 slideshows** · content for the user's own demo IG (grow-fast flex account) · separate Spanish-content account.

---

## MCP / connector state (the "merge" info)
| Connector | State | Notes |
|---|---|---|
| **Composio** | connected, **disabled in chat** | Gateway to everything below. Re-enable in-chat to use. |
| **Gemini** (via Composio) | authless, ready when Composio on | `GEMINI_GENERATE_IMAGE` model `gemini-3-pro-image-preview` = **Nano Banana Pro**; `GEMINI_GENERATE_VIDEOS` = **Veo 3.1** (9:16, 4/6/8s, 720p, **no** `negative_prompt`). |
| **Composio Browser + Search** | authless | `BROWSER_TOOL_CREATE_TASK/WATCH/STOP`, `COMPOSIO_SEARCH_WEB/IMAGE/FETCH_URL_CONTENT`. Runs Claude-side — reaches sites the sandbox can't. |
| **Instagram** (via Composio) | connected as **@l0stindsauce** (NOT the bikes account) | Graph API = own-account only; can't read arbitrary/other accounts or "liked" posts. |
| **Canva** | connected in chat | `generate-design` used for social concepts. |
| Higgsfield / ElevenLabs / ChatGPT | unavailable | Not reachable; use Veo/Nano Banana instead. |

**Important:** scheduled Routines fire **without** connector tools, so overnight unattended generation is **not possible** — the batch must run in an interactive session with Composio enabled.

---

## What's built (all committed/pushed)
| Deliverable | Location |
|---|---|
| OmniRoute pipeline scaffold | `scorpion.js`, `package.json`, `.env.example` |
| Content pack (hooks, VO scripts, prompts, captions) | `alpha-reels/content-pack.md` |
| Remotion project (reel renderer) | `alpha-reels/src/` |
| — Reel template (logo/hook/clip) | `alpha-reels/src/Reel.tsx` |
| — Aesthetic montage (crossfade) | `alpha-reels/src/AestheticMontage.tsx` |
| — **Hard-cut reel (no fades)** | `alpha-reels/src/HardCutReel.tsx` |
| Landing page mockup (v1) | `alpha-reels/landing-mockup.html` |
| **Full site redesign builder** | `alpha-reels/build-site.mjs` → outputs `alpha-reels/site/index.html` (gitignored) |

## Generated assets (gitignored — regenerate via Composio if lost)
In `alpha-reels/generated/`:
- `01-garage.jpg`, `02-rider.jpg`, `03-macro.jpg` — neon/garage set
- `p1-blossom-street.jpg`, `p2-snow.jpg`, `p3-golden.jpg` — Porsche/blossom set (best-looking)
- `veo-orbit.mp4` — 8s Veo clip
Copies used by Remotion live in `alpha-reels/public/gen/01–06.jpg`.

---

## How to run things (verified)
- **Render a reel:** from `alpha-reels/`:
  ```bash
  npx remotion render src/index.ts HardCutReel out/x.mp4 \
    --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
  ```
  Use the **headless-shell** binary — the full `chrome` binary rejects Remotion's headless mode.
- **Rebuild site:** `node build-site.mjs` (uses `sharp` to embed images as base64).
- **Crop/resize images:** `sharp` is installed in `alpha-reels/node_modules`.
- **ffmpeg** (for stitching Veo clips): `/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux` (note: minimal build — can't decode 16-bit PNG; use `sharp` for those).
- **Downloads:** Composio R2 result URLs (`temp.*.r2.cloudflarestorage.com`) ARE reachable from the sandbox; brand CDNs and most external hosts are **blocked** by the sandbox egress policy. Fetch external images via Composio browser → R2, then download.

## Open items / blockers
- 🔴 Composio disabled in chat (only the user can toggle).
- 🟠 Real bike photos needed — upload, or fetch official product shots via Composio browser.
- 🟠 Alpha Volt Electric address (placeholder in `build-site.mjs`) + confirm its IG handle.
- 🟠 Real logo (site + reels use a placeholder; user wants a full identity redesign anyway).

## Shot list for the batch (when Composio is on)
- Reels 1–3 Sur-Ron Ultra Bee (blossom → neon garage → dirt rip)
- Reels 4–6 Talaria Sting (snow → asphalt roll → trail launch)
- Reels 7–9 Ventus / Strike (golden hour → night city → rain)
- Reels 10–12 Shadow / Yozma (studio detail → rooftop → tunnel)
- Reels 13–15 mixed hype cuts + user's demo-account content
- 10 slideshows from Nano Banana stills
- Generate per-brand Veo clips, then hard-cut with ffmpeg (`concat`, no fades).

## PR subscription
This session is subscribed to PR #1 with ~hourly self check-ins (send_later). Stop them when the PR merges/closes.
