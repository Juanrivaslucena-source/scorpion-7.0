# Alpha Reels — Development Status

**Last Updated:** 2026-07-29  
**Target Deadline:** End of week (pitch to Alpha Electric Bikes)  
**Target:** 15+ reels for full pitch package

## Summary

All 16 compositions are **code-complete** and ready to render. Arctic Leopard (#1) is fully configured with official product photos. Bikes #2-8 are in simplified hero format. Rendering is setup via both local CLI and GitHub Actions CI/CD.

## Deliverables Checklist

### ✅ COMPLETED
- [x] 8 per-brand showcase reel code (Remotion compositions)
- [x] 8 promo/montage/hook reel code
- [x] Arctic Leopard (#1) — fully configured with official XF, XE Pro S, XE Pro R photos
- [x] Visual design guide (style-guide.html artifact)
- [x] Rendering documentation (RENDERING.md)
- [x] GitHub Actions CI/CD workflow (.github/workflows/render.yml)
- [x] Local rendering instructions
- [x] Composition preview catalog (preview.html)
- [x] Remotion root composition (Root.tsx with 16 entries)

### 📝 IN PROGRESS / NEXT
- [ ] Render all 16 compositions to MP4
  - Option A: Use GitHub Actions (push to branch, workflow auto-renders)
  - Option B: Render locally on your machine with `npm install && npx remotion render <id>`
  - Option C: Use Remotion Cloud if API key available
- [ ] Source product images for bikes #2-8 (optional — currently simplified)
- [ ] Prepare 4 demo video clips for hook reels (clips/wheelie.mp4, clips/stoppie.mp4, etc.)
- [ ] Upload rendered videos to hosting (Composio R2, S3, etc.)
- [ ] Create demo Instagram account with rendered content
- [ ] Test all reels render without errors

## Current File Structure

```
alpha-reels/
├── src/
│   ├── Root.tsx                    ✅ 16 compositions defined
│   ├── BrandShowcase.tsx           ✅ Reusable brand showcase template
│   ├── Reel.tsx                    ✅ Hook reel template
│   ├── RealBrandReel.tsx           ✅ 8-bike montage (gritty)
│   ├── RealBikeLineup.tsx          ✅ 3-bike lineup (premium)
│   ├── HardCutReel.tsx             ✅ 6-bike hard cuts (bikelife)
│   └── AestheticMontage.tsx        ✅ 16-frame cinematic montage
├── public/
│   ├── al/                         ✅ Arctic Leopard official photos
│   │   ├── xf.jpg
│   │   ├── xepros.jpg
│   │   └── xepror.jpg
│   ├── brands/                     ✅ User's 8 bikes
│   │   ├── 01.jpg (Arctic Leopard)
│   │   ├── 02.jpg (Altis Sigma)
│   │   ├── 03.jpg (79Bike)
│   │   ├── 04.jpg (Ventus One Plus)
│   │   ├── 05.jpg (Yozma IN 10 Pro)
│   │   ├── 06.jpg (eRide Pro SS)
│   │   ├── 07.jpg (Sur-Ron Ultra Bee)
│   │   └── 08.jpg (Y-Volt)
│   ├── real/                       ✅ Premium bike photos
│   │   ├── ultrabee.jpg
│   │   ├── talaria.jpg
│   │   └── stormbee.jpg
│   └── clips/                      📝 Video clips (needed for hooks)
├── .github/
│   └── workflows/
│       └── render.yml              ✅ CI/CD rendering pipeline
├── RENDERING.md                    ✅ Rendering guide
├── STATUS.md                       ✅ This file
├── preview.html                    ✅ Composition catalog
├── style-guide.html                ✅ Design system artifact
└── package.json                    ✅ Dependencies configured
```

## Composition Details

### Brand Showcase Reels (8 total)
Each is 155–225 frames (5–8 seconds) depending on number of models.

1. **ArcticLeopard** — ✅ READY
   - Hero: XE PRO (desert-tested)
   - Lineup: XF (12kW compact), XE Pro S (20kW), XE Pro R (26.5kW 72 mph)
   - Duration: 155 frames (5.2s)

2. **79Bike** — 📝 PLACEHOLDER
   - Hero: Falcon (brands/03.jpg)
   - Lineup: Viper (15kW), Eagle (20kW)
   - Duration: 225 frames (7.5s)

3. **VentusOnePlus** — 📝 PLACEHOLDER
   - Hero: One Plus (brands/04.jpg)
   - Duration: 155 frames (5.2s)

4. **YozmaIN10Pro** — 📝 PLACEHOLDER
   - Hero: IN 10 Pro (brands/05.jpg)
   - Duration: 155 frames (5.2s)

5. **eRideProSS** — 📝 PLACEHOLDER
   - Hero: Pro SS (brands/06.jpg)
   - Duration: 155 frames (5.2s)

6. **SurRonUltraBee** — 📝 PLACEHOLDER
   - Hero: Ultra Bee (brands/07.jpg)
   - Lineup: Ultra Bee Sport (brands/07.jpg + real/ultrabee.jpg)
   - Duration: 225 frames (7.5s)

7. **YVolt** — 📝 PLACEHOLDER
   - Hero: Y-Volt Max (brands/08.jpg)
   - Duration: 155 frames (5.2s)

8. **AltisSigma** — 📝 PLACEHOLDER
   - Hero: Sigma (brands/02.jpg)
   - Duration: 155 frames (5.2s)

### Promo & Montage Reels (8 total)

1. **RealBrandReel** — ✅ READY
   - 8 hard-cut brand shots (gritty aesthetic)
   - End card: "EVERY BRAND. ONE SHOP. KISSIMMEE, FL."
   - Duration: 477 frames (15.9s)

2. **RealBikeLineup** — ✅ READY
   - 3 premium hero bikes (Ultra Bee, Talaria, Storm Bee)
   - Duration: 410 frames (13.7s)

3. **HardCutReel** — ✅ READY
   - 6 gritty cuts, no fades
   - Duration: 450 frames (15s)

4. **AestheticEdit** — ✅ READY
   - 16-frame cinematic montage
   - Duration: 480 frames (16s)

5. **JustDropped** — 📝 HOOK (needs clip)
   - Hook: "IT'S HERE."
   - Tagline: "The new Sur-Ron just dropped"
   - Video clip: clips/wheelie.mp4 (or placeholder)

6. **FinancingHook** — 📝 HOOK (needs clip)
   - Hook: "$49 DOWN."
   - Tagline: "No credit check · Ride home today"
   - Video clip: clips/stoppie.mp4 (or placeholder)

7. **Bikelife** — 📝 HOOK (needs clip)
   - Hook: "RUN WITH THE PACK."
   - Brand: "Alpha Electric Bikes"
   - Video clip: clips/bikelife.mp4 (or placeholder)

8. **RideAndRepair** — 📝 HOOK (needs clip)
   - Hook: "WE SELL IT. WE FIX IT."
   - Tagline: "Expert service + repair"
   - Video clip: clips/service.mp4 (or placeholder)

## Next Steps (Immediate)

### Step 1: Render Videos (Pick One)

**Option A: GitHub Actions (Recommended for automatic builds)**
```bash
# Push to the feature branch — workflow auto-renders all 16 compositions
git push origin claude/first-pr-setup-ttqfio
# Check Actions tab for progress → download artifacts when complete
```

**Option B: Local Rendering**
```bash
cd alpha-reels
npm install
npx remotion render ArcticLeopard --output out/arctic-leopard.mp4
npx remotion render 79Bike --output out/79bike.mp4
# ... repeat for all 16
```

**Option C: Batch Render All**
```bash
cd alpha-reels
npm install
npx remotion render --concurrency 2 --list  # See all compositions
for comp in ArcticLeopard 79Bike VentusOnePlus YozmaIN10Pro eRideProSS SurRonUltraBee YVolt AltisSigma RealBrandReel RealBikeLineup HardCutReel AestheticEdit JustDropped FinancingHook Bikelife RideAndRepair; do
  npx remotion render $comp --output out/$comp.mp4
done
```

### Step 2: Prepare Demo Content
- [ ] Add 4 short video clips to `public/clips/` for hook reels (optional — can use placeholder)
- [ ] Test all 16 compositions render without errors
- [ ] Upload rendered videos to hosting service (S3, R2, etc.)

### Step 3: Create Instagram Account
- [ ] Set up demo @AlphaElectricKissimmee Instagram account
- [ ] Post 5–8 rendered reels to show proof-of-concept (target: 1k views)
- [ ] Include link to Kissimmee location, financing info, etc.

### Step 4: Final Pitch Package
- [ ] Export all 16 MP4s
- [ ] Create a Pitch Deck PDF with video embeds or links
- [ ] Prepare 30-second pitch summary
- [ ] Present to Alpha Electric Bikes owner

## Key Decisions Made

1. **8 Brand Showcases + 8 Montage/Promo Reels = 16 total** (exceeds 15-reel target)
2. **Simplified format for bikes #2-8** (single hero photo) pending product image sourcing
3. **Two aesthetic lanes locked down:** Porsche-edit (soft, pink, pastel) & Gritty Bikelife (dark, hard-cuts, neon)
4. **Rendering via GitHub Actions** solves sandbox network constraints
5. **All code is component-based** so adding new reels or tweaking aesthetics is fast

## Technical Notes

- **Remotion Version:** 4.0.500 (React-based video rendering)
- **Resolution:** 1080×1920 (9:16 vertical, TikTok/Instagram Reels native)
- **Frame Rate:** 30 FPS
- **Total Content Duration:** ~120 seconds of unique video (2 minutes)
- **Rendering Time Estimate:** 30–60 minutes for all 16 (depends on machine specs)

## Questions / Blockers

**Q: Can I add more bikes to the showcase?**  
A: Yes. Add a new composition to `Root.tsx` using `BrandShowcase` or `RealBrandReel` template, then render.

**Q: What if I want to change colors/text/timing?**  
A: Edit the component `.tsx` files (e.g., `BrandShowcase.tsx`, `Reel.tsx`) and re-render.

**Q: Can I use different video clips for the hook reels?**  
A: Yes. Add to `public/clips/` and update the `clip` prop in `Root.tsx` defaultProps.

**Q: Do I need all 16 reels for the pitch?**  
A: No. Minimum viable: Arctic Leopard (#1) + RealBrandReel + 2–3 hook reels = 4–5 reels sufficient to wow. 16 gives you comprehensive options.

---

**Status:** Ready for rendering & deployment  
**Next Action:** Render videos (Step 1 above)  
**Estimated Time to Completion:** 1–2 hours (rendering) + 2–3 hours (social content setup) = ~4–5 hours total
