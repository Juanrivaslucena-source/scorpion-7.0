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

export type Item = { src: string; model: string; spec: string; fit: 'cover' | 'contain' };
export type BrandShowcaseProps = { brand: string; tagline: string; items: Item[] };

export const INTRO = 40;
export const ITEM = 70;
export const OUTRO = 45;
export const showcaseDuration = (n: number) => INTRO + n * ITEM + OUTRO;

const Intro: React.FC<{ brand: string; tagline: string }> = ({ brand, tagline }) => {
  const f = useCurrentFrame();
  const op = interpolate(f, [3, 16, INTRO - 10, INTRO], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(f, [3, 20], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.ease) });
  if (f >= INTRO) return null;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: op }}>
      <div style={{ textAlign: 'center', transform: `translateY(${y}px)` }}>
        <div style={{ color: '#e11d63', fontFamily: 'ui-monospace,monospace', fontSize: 20, letterSpacing: 5, marginBottom: 14 }}>{tagline.toUpperCase()}</div>
        <div style={{ color: '#141317', fontFamily: 'Arial Black,sans-serif', fontWeight: 900, fontSize: 104, letterSpacing: -3, lineHeight: .9 }}>{brand}</div>
      </div>
    </AbsoluteFill>
  );
};

const Shot: React.FC<{ item: Item; start: number }> = ({ item, start }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = f - start;
  if (local < 0 || local >= ITEM) return null;
  const scale = interpolate(local, [0, ITEM], item.fit === 'cover' ? [1.08, 1.18] : [1.0, 1.06], { easing: Easing.inOut(Easing.ease) });
  const punch = spring({ frame: local, fps, config: { damping: 13, mass: 0.5 } });
  const labelX = interpolate(punch, [0, 1], [-40, 0]);
  const dark = item.fit === 'cover';
  const ink = dark ? '#fff' : '#141317';

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: item.fit === 'contain' ? '0 30px' : 0, transform: `scale(${scale})` }}>
        <Img src={staticFile(item.src)} style={{ width: '100%', height: '100%', objectFit: item.fit, filter: item.fit === 'contain' ? 'drop-shadow(0 26px 34px rgba(0,0,0,.16))' : 'saturate(1.08) contrast(1.04)' }} />
      </AbsoluteFill>
      {dark && <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,.3) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,.7) 100%)' }} />}
      <div style={{ position: 'absolute', top: 120, left: 60, opacity: punch, transform: `translateX(${labelX}px)` }}>
        <div style={{ color: '#e11d63', fontFamily: 'ui-monospace,monospace', fontSize: 18, letterSpacing: 4 }}>MODEL</div>
        <div style={{ color: ink, fontFamily: 'Arial Black,sans-serif', fontWeight: 900, fontSize: 82, letterSpacing: -2, lineHeight: .95, marginTop: 4, textShadow: dark ? '0 2px 16px rgba(0,0,0,.6)' : 'none' }}>{item.model}</div>
      </div>
      <div style={{ position: 'absolute', bottom: 150, left: 60, opacity: punch }}>
        <span style={{ display: 'inline-block', background: dark ? 'rgba(255,255,255,.14)' : '#141317', color: dark ? '#fff' : '#fff', fontFamily: 'Arial,sans-serif', fontWeight: 700, fontSize: 30, padding: '10px 20px', borderRadius: 10, backdropFilter: dark ? 'blur(6px)' : undefined }}>{item.spec}</span>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ start: number; brand: string }> = ({ start, brand }) => {
  const f = useCurrentFrame();
  const local = f - start;
  if (local < 0) return null;
  const op = interpolate(local, [4, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ backgroundColor: '#0b0b0d', justifyContent: 'center', alignItems: 'center', opacity: op }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ color: '#9a95a3', fontFamily: 'ui-monospace,monospace', fontSize: 20, letterSpacing: 5, marginBottom: 12 }}>{brand.toUpperCase()}</div>
        <div style={{ color: '#fff', fontFamily: 'Arial Black,sans-serif', fontWeight: 900, fontSize: 88, letterSpacing: -3 }}>AT ALPHA ELECTRIC</div>
        <div style={{ marginTop: 16, color: '#9a95a3', fontFamily: 'Arial,sans-serif', fontWeight: 600, fontSize: 38 }}>Kissimmee, FL · financing available</div>
      </div>
    </AbsoluteFill>
  );
};

export const BrandShowcase: React.FC<BrandShowcaseProps> = ({ brand, tagline, items }) => {
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 38%, #ffffff 0%, #ecebef 72%, #e1dfe5 100%)' }}>
      <Intro brand={brand} tagline={tagline} />
      {items.map((it, i) => (
        <Shot key={it.src} item={it} start={INTRO + i * ITEM} />
      ))}
      <Outro start={INTRO + items.length * ITEM} brand={brand} />
    </AbsoluteFill>
  );
};
