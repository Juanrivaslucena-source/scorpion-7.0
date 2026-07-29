import React from 'react';
import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';

// Hard-cut reel: no crossfades. Each shot holds full-opacity for its window,
// with a Ken Burns push and a quick brand-label punch-in on the cut.
type Shot = { src: string; brand: string; sub: string; zoom: [number, number] };

const SHOTS: Shot[] = [
  { src: 'gen/04.jpg', brand: 'SUR-RON', sub: 'Ultra Bee', zoom: [1.08, 1.2] },
  { src: 'gen/01.jpg', brand: 'TALARIA', sub: 'Sting', zoom: [1.12, 1.24] },
  { src: 'gen/06.jpg', brand: 'VENTUS', sub: 'Supermoto', zoom: [1.1, 1.22] },
  { src: 'gen/05.jpg', brand: 'STRIKE', sub: 'Shadow', zoom: [1.1, 1.22] },
  { src: 'gen/03.jpg', brand: 'YOZMA', sub: 'Dialed', zoom: [1.14, 1.28] },
  { src: 'gen/02.jpg', brand: 'ALPHA ELECTRIC', sub: 'Run the pack', zoom: [1.1, 1.2] },
];

const SHOT_LEN = 75; // 2.5s per shot @ 30fps -> 6 shots = 15s

const Shot: React.FC<{ shot: Shot; index: number }> = ({ shot, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = index * SHOT_LEN;
  const local = frame - start;
  // Hard cut: render only inside this window, no fade.
  if (local < 0 || local >= SHOT_LEN) return null;

  const scale = interpolate(local, [0, SHOT_LEN], [shot.zoom[0], shot.zoom[1]], {
    easing: Easing.inOut(Easing.ease),
  });

  // Brand label punches in fast at the cut.
  const punch = spring({ frame: local, fps, config: { damping: 12, mass: 0.5 } });
  const labelY = interpolate(punch, [0, 1], [40, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Img
          src={staticFile(shot.src)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'saturate(1.12) contrast(1.04)',
          }}
        />
      </AbsoluteFill>

      {/* pink cinematic grade */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(140deg, rgba(255,120,165,0.22), rgba(140,120,255,0.14))',
          mixBlendMode: 'soft-light',
        }}
      />
      {/* vignette + bottom scrim */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%), linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.72) 100%)',
        }}
      />

      {/* brand label */}
      <div
        style={{
          position: 'absolute',
          left: 60,
          bottom: 150,
          transform: `translateY(${labelY}px)`,
          opacity: punch,
        }}
      >
        <div
          style={{
            color: '#fff',
            fontFamily: 'Arial Black, sans-serif',
            fontWeight: 900,
            fontSize: 86,
            letterSpacing: -2,
            lineHeight: 0.95,
            textShadow: '0 3px 20px rgba(0,0,0,0.6)',
          }}
        >
          {shot.brand}
        </div>
        <div
          style={{
            marginTop: 8,
            color: '#ffc2d6',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            fontSize: 40,
          }}
        >
          {shot.sub}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const HardCutReel: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {SHOTS.map((shot, i) => (
        <Shot key={shot.src} shot={shot} index={i} />
      ))}
    </AbsoluteFill>
  );
};
