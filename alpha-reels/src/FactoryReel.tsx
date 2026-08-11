import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Series,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// The composition the Stitch agent renders. It is fully data-driven: the
// factory writes an EDL (edit decision list) as JSON and passes it as props, so
// this one component renders every reel the factory produces.

export type Segment = {
  clip: string; // public-relative path, e.g. 'factory/<job>/source.mp4'
  type: 'video' | 'image';
  startInClip: number; // seconds into the clip to start (video only)
  seconds: number; // how long this segment plays
  caption: string;
  captionStyle: 'hook' | 'sub';
  logo: string; // public-relative logo path, or ''
};

export type EDL = {
  width: number;
  height: number;
  fps: number;
  accent: string;
  totalFrames: number;
  audio: string | null; // public-relative audio path, or null
  segments: Segment[];
};

// Lets Remotion size + time the video straight from the EDL props.
export const calcReelMetadata = ({ props }: { props: EDL }) => ({
  durationInFrames: Math.max(1, props.totalFrames || 1),
  width: props.width || 1080,
  height: props.height || 1920,
  fps: props.fps || 30,
});

const Caption: React.FC<{ text: string; style: 'hook' | 'sub'; accent: string }> = ({
  text,
  style,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 14 } });
  const y = interpolate(enter, [0, 1], [60, 0]);
  if (!text) return null;

  if (style === 'hook') {
    return (
      <div style={{ position: 'absolute', top: 150, left: 60, right: 60, transform: `translateY(${y}px)`, opacity: enter }}>
        <div
          style={{
            display: 'inline-block',
            backgroundColor: accent,
            color: '#000',
            fontFamily: 'Arial Black, sans-serif',
            fontWeight: 900,
            fontSize: 92,
            lineHeight: 1.02,
            letterSpacing: -2,
            padding: '10px 22px',
            textTransform: 'uppercase',
          }}
        >
          {text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', bottom: 180, left: 60, right: 60, transform: `translateY(${y}px)`, opacity: enter }}>
      <div
        style={{
          color: '#fff',
          fontFamily: 'Arial, sans-serif',
          fontWeight: 700,
          fontSize: 52,
          textShadow: '0 2px 12px rgba(0,0,0,0.85)',
        }}
      >
        {text}
      </div>
    </div>
  );
};

const Shot: React.FC<{ seg: Segment; accent: string }> = ({ seg, accent }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      {seg.clip ? (
        seg.type === 'video' ? (
          <OffthreadVideo
            src={staticFile(seg.clip)}
            muted
            trimBefore={Math.round((seg.startInClip || 0) * fps)}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        ) : (
          <Img src={staticFile(seg.clip)} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
        )
      ) : (
        <AbsoluteFill style={{ background: 'radial-gradient(circle at 50% 35%, #1a1a1a 0%, #000 70%)' }} />
      )}

      {/* Scrim for legibility. */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.78) 100%)',
        }}
      />

      <Caption text={seg.caption} style={seg.captionStyle} accent={accent} />

      {seg.logo ? (
        <Img src={staticFile(seg.logo)} style={{ position: 'absolute', bottom: 90, left: 60, height: 120 }} />
      ) : null}
    </AbsoluteFill>
  );
};

export const FactoryReel: React.FC<EDL> = (edl) => {
  const fps = edl.fps || 30;
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <Series>
        {edl.segments.map((seg, i) => (
          <Series.Sequence key={i} durationInFrames={Math.max(1, Math.round(seg.seconds * fps))}>
            <Shot seg={seg} accent={edl.accent} />
          </Series.Sequence>
        ))}
      </Series>
      {edl.audio ? <Audio src={staticFile(edl.audio)} /> : null}
    </AbsoluteFill>
  );
};

export default FactoryReel;
