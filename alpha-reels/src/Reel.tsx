import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Img,
  staticFile,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export type ReelProps = {
  hook: string;
  subtitle: string;
  // Path inside public/, e.g. 'clips/wheelie.mp4'. Empty = show placeholder.
  clip: string;
  // Path inside public/, e.g. 'logo.png'. Empty = no logo.
  logo: string;
  accent: string;
  // Text shown on the placeholder before a clip is uploaded.
  clipHint: string;
};

export const Reel: React.FC<ReelProps> = ({
  hook,
  subtitle,
  clip,
  logo,
  accent,
  clipHint,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const hookIn = spring({ frame, fps, config: { damping: 14 } });
  const hookY = interpolate(hookIn, [0, 1], [80, 0]);

  const fadeOut = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a', opacity: fadeOut }}>
      {/* Background: uploaded clip, or a branded placeholder. */}
      {clip ? (
        <OffthreadVideo
          src={staticFile(clip)}
          muted
          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
        />
      ) : (
        <AbsoluteFill
          style={{
            background: 'radial-gradient(circle at 50% 35%, #1a1a1a 0%, #000 70%)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ color: '#3a3a3a', fontSize: 38, fontFamily: 'sans-serif' }}>
            {clipHint}
          </div>
        </AbsoluteFill>
      )}

      {/* Scrim for legibility. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.75) 100%)',
        }}
      />

      {/* Hook (top). */}
      <div
        style={{
          position: 'absolute',
          top: 140,
          left: 60,
          right: 60,
          transform: `translateY(${hookY}px)`,
          opacity: hookIn,
        }}
      >
        <div
          style={{
            display: 'inline-block',
            backgroundColor: accent,
            color: '#000',
            fontFamily: 'Arial Black, sans-serif',
            fontWeight: 900,
            fontSize: 96,
            lineHeight: 1.02,
            letterSpacing: -2,
            padding: '10px 22px',
            textTransform: 'uppercase',
          }}
        >
          {hook}
        </div>
      </div>

      {/* Subtitle + logo (bottom). */}
      <div style={{ position: 'absolute', bottom: 120, left: 60, right: 60 }}>
        <div
          style={{
            color: '#fff',
            fontFamily: 'Arial, sans-serif',
            fontWeight: 700,
            fontSize: 52,
            textShadow: '0 2px 12px rgba(0,0,0,0.8)',
          }}
        >
          {subtitle}
        </div>
        {logo ? (
          <Img src={staticFile(logo)} style={{ height: 130, marginTop: 24 }} />
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
