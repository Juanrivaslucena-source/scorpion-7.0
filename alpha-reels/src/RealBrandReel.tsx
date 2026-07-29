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

// Gritty dark hard-cut reel over REAL branded bike photos. No fades.
type Shot = { src: string; brand: string; sub: string; pan: number };

const SHOTS: Shot[] = [
  { src: 'brands/01.jpg', brand: 'SUR-RON', sub: 'Ultra Bee', pan: 20 },
  { src: 'brands/02.jpg', brand: '79BIKE', sub: 'Falcon', pan: -20 },
  { src: 'brands/03.jpg', brand: 'ARCTIC LEOPARD', sub: 'MX', pan: 18 },
  { src: 'brands/04.jpg', brand: 'YOZMA', sub: 'IN10 Pro', pan: -16 },
  { src: 'brands/05.jpg', brand: 'ALTIS', sub: 'E-Powersport', pan: 16 },
  { src: 'brands/06.jpg', brand: 'STRIKE', sub: 'Pro', pan: -18 },
  { src: 'brands/07.jpg', brand: 'SHADOW', sub: 'X', pan: 18 },
  { src: 'brands/08.jpg', brand: 'VENTUS', sub: 'Trail', pan: -14 },
];

const LEN = 54; // ~1.8s per shot @30fps -> 8 shots ~ 14.4s

const Shot: React.FC<{ shot: Shot; i: number }> = ({ shot, i }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = i * LEN;
  const local = f - start;
  if (local < 0 || local >= LEN) return null;

  const scale = interpolate(local, [0, LEN], [1.12, 1.24], { easing: Easing.inOut(Easing.ease) });
  const panX = interpolate(local, [0, LEN], [0, shot.pan]);
  const punch = spring({ frame: local, fps, config: { damping: 12, mass: 0.5 } });
  const labelY = interpolate(punch, [0, 1], [34, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translateX(${panX}px)` }}>
        <Img src={staticFile(shot.src)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.1) contrast(1.06)' }} />
      </AbsoluteFill>
      {/* pink cinematic grade */}
      <AbsoluteFill style={{ background: 'linear-gradient(135deg, rgba(255,80,140,0.14), rgba(120,120,255,0.10))', mixBlendMode: 'soft-light' }} />
      {/* vignette + scrim */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 44%, rgba(0,0,0,0.6) 100%), linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.8) 100%)' }} />
      {/* brand label */}
      <div style={{ position: 'absolute', left: 60, bottom: 148, transform: `translateY(${labelY}px)`, opacity: punch }}>
        <div style={{ color: '#fff', fontFamily: 'Arial Black, sans-serif', fontWeight: 900, fontSize: 84, letterSpacing: -2, lineHeight: 0.94, textShadow: '0 3px 22px rgba(0,0,0,0.7)' }}>{shot.brand}</div>
        <div style={{ marginTop: 6, color: '#ffbcd4', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: 40 }}>{shot.sub}</div>
      </div>
      {/* top brand tick */}
      <div style={{ position: 'absolute', top: 70, left: 60, opacity: punch, color: '#fff', fontFamily: 'ui-monospace, monospace', fontSize: 20, letterSpacing: 4 }}>
        ALPHA ELECTRIC · {String(i + 1).padStart(2, '0')}/08
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ start: number }> = ({ start }) => {
  const f = useCurrentFrame();
  const local = f - start;
  if (local < 0) return null;
  const op = interpolate(local, [3, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0c', justifyContent: 'center', alignItems: 'center', opacity: op }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#fff', fontFamily: 'Arial Black, sans-serif', fontWeight: 900, fontSize: 96, letterSpacing: -3 }}>ALPHA ELECTRIC</div>
        <div style={{ marginTop: 16, color: '#9a95a3', fontFamily: 'Arial, sans-serif', fontWeight: 600, fontSize: 40 }}>Every brand. One shop. Kissimmee, FL.</div>
      </div>
    </AbsoluteFill>
  );
};

export const RealBrandReel: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {SHOTS.map((s, i) => (
        <Shot key={s.src} shot={s} i={i} />
      ))}
      <EndCard start={SHOTS.length * LEN} />
    </AbsoluteFill>
  );
};
