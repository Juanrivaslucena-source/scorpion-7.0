# Video Rendering Guide

## Compositions Ready to Render

All 16 compositions are defined in `src/Root.tsx` and ready to render to MP4.

### Per-Brand Showcase Reels (8 total)
1. **ArcticLeopard** — 155 frames (5.2s) — Full lineup: XF → XE Pro S → XE Pro R
2. **79Bike** — 225 frames (7.5s) — Falcon hero + Viper + Eagle
3. **VentusOnePlus** — 155 frames (5.2s) — One Plus hero  
4. **YozmaIN10Pro** — 155 frames (5.2s) — IN 10 Pro hero
5. **eRideProSS** — 155 frames (5.2s) — Pro SS hero
6. **SurRonUltraBee** — 225 frames (7.5s) — Ultra Bee hero + sport variant
7. **YVolt** — 155 frames (5.2s) — Y-Volt Max hero
8. **AltisSigma** — 155 frames (5.2s) — Sigma hero

### Promo & Montage Reels (8 total)
- **RealBrandReel** — 8 hard-cut brand shots + end card
- **RealBikeLineup** — 3 hero bikes with specs
- **HardCutReel** — 6 gritty cuts, dark aesthetic
- **AestheticEdit** — 16-frame montage
- **JustDropped** — Hook reel ("IT'S HERE.") with video clip
- **FinancingHook** — Hook reel ("$49 DOWN.") with video clip
- **Bikelife** — Hook reel ("RUN WITH THE PACK.")
- **RideAndRepair** — Hook reel ("WE SELL IT. WE FIX IT.")

## Rendering Instructions

### Option 1: Local Machine (Recommended)
```bash
cd alpha-reels
npm install
npx remotion render ArcticLeopard --output out/arctic-leopard.mp4
npx remotion render 79Bike --output out/79bike.mp4
# ...etc for all 16 compositions
```

### Option 2: GitHub Actions (CI/CD)
Use the provided workflow file `.github/workflows/render.yml` to render all videos on push to the branch.

### Option 3: Remotion Cloud
Set `REMOTION_API_KEY` and use:
```bash
npx remotion render-on-lambda <composition-id>
```

## Image Assets Required

### Completed
- ✅ `public/al/` — Arctic Leopard lineup (XF, XE Pro S, XE Pro R)
- ✅ `public/brands/01-08.jpg` — User's 8 bikes
- ✅ `public/real/` — Ultra Bee, Talaria, Storm Bee

### Needed
- 📝 `public/79bike/` — 79Bike models (Viper, Eagle)
- 📝 `public/altis/` — Altis models (if going beyond simplified Sigma)
- 📝 `public/ventus/`, `public/yozma/`, `public/eride/`, `public/yvolt/` — Other brand lineups (optional for current versions)

## Current Status
- ✅ All compositions defined in code
- ✅ Arctic Leopard fully configured with official photos
- ⚠️ Bikes #2-8 in simplified hero format (can expand later)
- ⏳ Rendering blocked by network policy in current environment
- 📝 Environment setup: See network policy notes in `/root/.ccr/README.md`

## Next Steps
1. Render all 16 compositions (use Option 1 or 2 above)
2. Upload to S3/Composio R2 for hosting
3. Create social media posts with video embeds
4. Set up demo Instagram account with rendered content
