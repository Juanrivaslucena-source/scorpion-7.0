import React from 'react';
import { Composition } from 'remotion';
import { Reel } from './Reel';

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
