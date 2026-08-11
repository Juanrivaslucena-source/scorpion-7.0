import React from 'react';
import { Composition } from 'remotion';
import { Reel } from './Reel';
import { AestheticMontage } from './AestheticMontage';
import { HardCutReel } from './HardCutReel';
import { RealBikeLineup } from './RealBikeLineup';
import { RealBrandReel } from './RealBrandReel';
import { BrandShowcase, showcaseDuration } from './BrandShowcase';
import { FactoryReel, calcReelMetadata } from './FactoryReel';

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
        id="79Bike"
        component={BrandShowcase}
        durationInFrames={showcaseDuration(3)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          brand: '79BIKE',
          tagline: 'Built to ride',
          items: [
            { src: 'brands/03.jpg', model: 'FALCON', spec: 'City commuter · 10kW', fit: 'cover' as const },
            { src: '79bike/ex1.jpg', model: 'VIPER', spec: 'All-terrain · 15kW', fit: 'contain' as const },
            { src: '79bike/ex2.jpg', model: 'EAGLE', spec: 'Performance sport · 20kW', fit: 'contain' as const },
          ],
        }}
      />
      <Composition
        id="VentusOnePlus"
        component={BrandShowcase}
        durationInFrames={showcaseDuration(1)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          brand: 'VENTUS',
          tagline: 'Precision engineering',
          items: [
            { src: 'brands/04.jpg', model: 'ONE PLUS', spec: '12kW · 60V 100Ah · all-terrain', fit: 'cover' as const },
          ],
        }}
      />
      <Composition
        id="YozmaIN10Pro"
        component={BrandShowcase}
        durationInFrames={showcaseDuration(1)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          brand: 'YOZMA',
          tagline: 'For the ride',
          items: [
            { src: 'brands/05.jpg', model: 'IN 10 PRO', spec: '10kW · 72V · portable powerhouse', fit: 'cover' as const },
          ],
        }}
      />
      <Composition
        id="eRideProSS"
        component={BrandShowcase}
        durationInFrames={showcaseDuration(1)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          brand: 'eRIDE',
          tagline: 'Go electric',
          items: [
            { src: 'brands/06.jpg', model: 'PRO SS', spec: '8kW · 48V 60Ah · street sport', fit: 'cover' as const },
          ],
        }}
      />
      <Composition
        id="SurRonUltraBee"
        component={BrandShowcase}
        durationInFrames={showcaseDuration(2)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          brand: 'SUR-RON',
          tagline: 'Legendary performance',
          items: [
            { src: 'brands/07.jpg', model: 'ULTRA BEE', spec: 'Street & trail · 8kW', fit: 'cover' as const },
            { src: 'real/ultrabee.jpg', model: 'ULTRA BEE SPORT', spec: 'High-performance · 10kW', fit: 'contain' as const },
          ],
        }}
      />
      <Composition
        id="YVolt"
        component={BrandShowcase}
        durationInFrames={showcaseDuration(1)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          brand: 'Y-VOLT',
          tagline: 'Ride fast, ride far',
          items: [
            { src: 'brands/08.jpg', model: 'Y-VOLT MAX', spec: '5kW · 48V · commuter', fit: 'cover' as const },
          ],
        }}
      />
      <Composition
        id="AltisSigma"
        component={BrandShowcase}
        durationInFrames={showcaseDuration(1)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          brand: 'ALTIS',
          tagline: 'Engineered for power',
          items: [
            { src: 'brands/02.jpg', model: 'SIGMA', spec: '8kW · 52V 60Ah · Sport Trail', fit: 'cover' as const },
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
      {/* The Reel Factory renders through this one data-driven composition.
          The factory passes an EDL (edit decision list) as props; size and
          duration come from calcReelMetadata. The defaults below are just a
          harmless placeholder so it opens in the Studio. */}
      <Composition
        id="FactoryReel"
        component={FactoryReel}
        calculateMetadata={calcReelMetadata}
        durationInFrames={150}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          width: WIDTH,
          height: HEIGHT,
          fps: FPS,
          accent: '#FFD400',
          totalFrames: 150,
          audio: null,
          segments: [
            { clip: '', type: 'video' as const, startInClip: 0, seconds: 5, caption: 'INSTANT TORQUE.', captionStyle: 'hook' as const, logo: '' },
          ],
        }}
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
