# Alpha Reels — short-form video renderer

Renders vertical (9:16) 15s Instagram/TikTok reels for **Alpha Electric Bikes**
using [Remotion](https://remotion.dev). Drop in a clip + logo, render an MP4.

## What's here

- `content-pack.md` — hooks, AI-video prompts, voiceover scripts, captions for 4 videos.
- `src/Reel.tsx` — the reusable 9:16 template (animated hook, brand bar, logo, scrim).
- `src/Root.tsx` — 4 compositions: `JustDropped`, `FinancingHook`, `Bikelife`, `RideAndRepair`.

## Finish a video (3 steps)

1. **Add assets** to `public/`:
   - clip → `public/clips/wheelie.mp4` (etc.)
   - logo → `public/logo.png`
2. **Point the composition at them** in `src/Root.tsx` — set `clip` and `logo`
   (e.g. `clip: 'clips/wheelie.mp4'`, `logo: 'logo.png'`).
3. **Render:**
   ```bash
   npx remotion render src/index.ts JustDropped out/just-dropped.mp4 \
     --browser-executable=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
   ```

> Note: this environment needs the **headless-shell** Chrome binary (above) —
> the full `chrome` binary rejects Remotion's headless mode.

## Preview in the browser (Remotion Studio)

```bash
npx remotion studio src/index.ts
```

## Audio

ElevenLabs can't be reached from this environment. Workflow: generate the
voiceover from the scripts in `content-pack.md` on your own machine, upload the
MP3, and it gets composited in (add an `<Audio>` tag to the reel).
