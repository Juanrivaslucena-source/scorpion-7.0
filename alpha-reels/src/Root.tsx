import React from 'react';
import { Composition } from 'remotion';
import { Reel } from './Reel';
import { AestheticMontage } from './AestheticMontage';
import { HardCutReel } from './HardCutReel';
import { RealBikeLineup } from './RealBikeLineup';
import { RealBrandReel } from './RealBrandReel';
import { BrandShowcase, showcaseDuration } from './BrandShowcase';

// 9:16 vertical, 15s @ 30fps.
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const DURATION = 15 * FPS;

// One composition per video in the content pack.
// To finish a video: drop the clip in public/clips/, set `clip` and `logo`
// below to the real paths, then render.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ArcticLeopard"
        component={BrandShowcase}
        durationInFrames={showcaseDuration(4)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          brand: 'ARCTIC LEOPARD',
          tagline: 'The full lineup',
          items: [
            { src: 'brands/03.jpg', model: 'XE PRO', spec: 'Desert-tested', fit: 'cover' as const },
            { src: 'al/xf.jpg', model: 'XF', spec: '12kW · 130 lb · compact', fit: 'contain' as const },
            { src: 'al/xepros.jpg', model: 'XE PRO S', spec: '20kW · 74V 60Ah', fit: 'contain' as const },
            { src: 'al/xepror.jpg', model: 'XE PRO R', spec: '26.5kW · 700 Nm · 72 mph', fit: 'contain' as const },
          ],
        }}
      />
      <Composition
        id="RealBrandReel"
        component={RealBrandReel}
        durationInFrames={8 * 54 + 55}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="RealBikeLineup"
        component={RealBikeLineup}
        durationInFrames={45 + 3 * 105 + 55}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="HardCutReel"
        component={HardCutReel}
        durationInFrames={6 * 75}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="AestheticEdit"
        component={AestheticMontage}
        durationInFrames={16 * FPS}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="JustDropped"
        component={Reel}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          hook: "IT'S HERE.",
          subtitle: 'The new Sur-Ron just dropped',
          clip: '',
          logo: '',
          accent: '#E4FF1A',
          clipHint: 'clips/wheelie.mp4',
        }}
      />
      <Composition
        id="FinancingHook"
        component={Reel}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          hook: '$49 DOWN.',
          subtitle: 'No credit check · Ride home today',
          clip: '',
          logo: '',
          accent: '#FF2D2D',
          clipHint: 'clips/stoppie.mp4',
        }}
      />
      <Composition
        id="Bikelife"
        component={Reel}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          hook: 'RUN WITH THE PACK.',
          subtitle: 'Alpha Electric Bikes',
          clip: '',
          logo: '',
          accent: '#E4FF1A',
          clipHint: 'clips/bikelife.mp4',
        }}
      />
      <Composition
        id="RideAndRepair"
        component={Reel}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          hook: 'WE SELL IT. WE FIX IT.',
          subtitle: 'Expert service + repair',
          clip: '',
          logo: '',
          accent: '#FF2D2D',
          clipHint: 'clips/service.mp4',
        }}
      />
    </>
  );
};
