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

// Real product photos on a clean premium showroom background. Hard cuts.
type Bike = { src: string; brand: string; model: string; spec: string };

const BIKES: Bike[] = [
  { src: 'real/ultrabee.jpg', brand: 'SUR-RON', model: 'Ultra Bee', spec: 'Street & trail supermoto' },
  { src: 'real/talaria.jpg', brand: 'TALARIA', model: 'Sting R MX4', spec: 'Full-suspension off-road' },
  { src: 'real/stormbee.jpg', brand: 'SUR-RON', model: 'Storm Bee', spec: 'Full-size electric moto' },
];

const INTRO = 45;
const SHOT = 105; // per bike
const OUTRO = 55;

const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const op = interpolate(f, [3, 18, INTRO - 12, INTRO], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  if (f >= INTRO) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: op }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#e11d63', fontFamily: 'ui-monospace,monospace', fontSize: 22, letterSpacing: 6, marginBottom: 14 }}>THE LINEUP</div>
        <div style={{ color: '#141317', fontFamily: 'Arial Black,sans-serif', fontWeight: 900, fontSize: 120, letterSpacing: -3, lineHeight: .92 }}>IN STOCK<br />NOW</div>
      </div>
    </AbsoluteFill>
  );
};

const Shot: React.FC<{ bike: Bike; start: number }> = ({ bike, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = f - start;
  if (local < 0 || local >= SHOT) return null;

  const scale = interpolate(local, [0, SHOT], [1.0, 1.08], { easing: Easing.inOut(Easing.ease) });
  const inSpring = spring({ frame: local, fps, config: { damping: 13 } });
  const labelX = interpolate(inSpring, [0, 1], [-50, 0]);

  return (
    <AbsoluteFill>
      {/* bike */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 40px', transform: `scale(${scale})` }}>
        <Img src={staticFile(bike.src)} style={{ maxWidth: '100%', maxHeight: '78%', objectFit: 'contain', filter: 'drop-shadow(0 30px 40px rgba(0,0,0,.18))' }} />
      </AbsoluteFill>
      {/* brand block top-left */}
      <div style={{ position: 'absolute', top: 130, left: 60, opacity: inSpring, transform: `translateX(${labelX}px)` }}>
        <div style={{ color: '#e11d63', fontFamily: 'ui-monospace,monospace', fontSize: 18, letterSpacing: 4 }}>{bike.brand}</div>
        <div style={{ color: '#141317', fontFamily: 'Arial Black,sans-serif', fontWeight: 900, fontSize: 78, letterSpacing: -2, lineHeight: .95, marginTop: 4 }}>{bike.model}</div>
      </div>
      {/* spec chip bottom */}
      <div style={{ position: 'absolute', bottom: 150, left: 60, opacity: inSpring }}>
        <span style={{ display: 'inline-block', background: '#141317', color: '#fff', fontFamily: 'Arial,sans-serif', fontWeight: 700, fontSize: 30, padding: '11px 22px', borderRadius: 10 }}>{bike.spec}</span>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ start: number }> = ({ start }) => {
  const f = useCurrentFrame();
  const local = f - start;
  if (local < 0) return null;
  const op = interpolate(local, [4, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: op }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#141317', fontFamily: 'Arial Black,sans-serif', fontWeight: 900, fontSize: 96, letterSpacing: -3 }}>ALPHA ELECTRIC</div>
        <div style={{ marginTop: 18, color: '#5a5560', fontFamily: 'Arial,sans-serif', fontWeight: 600, fontSize: 40 }}>Kissimmee, FL · financing available</div>
      </div>
    </AbsoluteFill>
  );
};

export const RealBikeLineup: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 38%, #ffffff 0%, #ecebef 72%, #e2e0e6 100%)' }}>
      <Intro />
      {BIKES.map((b, i) => (
        <Shot key={b.src} bike={b} start={INTRO + i * SHOT} />
      ))}
      <Outro start={INTRO + BIKES.length * SHOT} />
    </AbsoluteFill>
  );
};
