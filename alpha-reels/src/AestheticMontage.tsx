import React from 'react';
import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from 'remotion';

type Slide = {
  src: string;
  caption: string;
  // Ken Burns direction: [startScale, endScale, panX]
  zoom: [number, number, number];
};

const SLIDES: Slide[] = [
  { src: 'photos/01.jpg', caption: 'the reveal.', zoom: [1.12, 1.26, -30] },
  { src: 'photos/02.jpg', caption: 'cleanest in the game.', zoom: [1.15, 1.28, 25] },
  { src: 'photos/03.jpg', caption: 'rooftop energy.', zoom: [1.12, 1.25, -25] },
  { src: 'photos/04.jpg', caption: 'wheelie season.', zoom: [1.2, 1.34, 20] },
];

const SLIDE_DUR = 150; // frames each slide is alive
const STEP = 110; // spacing between slide starts (40f crossfade)

const KenBurnsSlide: React.FC<{ slide: Slide; start: number }> = ({ slide, start }) => {
  const frame = useCurrentFrame();
  const local = frame - start;
  if (local < -5 || local > SLIDE_DUR + 5) return null;

  const opacity = interpolate(
    local,
    [0, 25, SLIDE_DUR - 25, SLIDE_DUR],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const scale = interpolate(local, [0, SLIDE_DUR], [slide.zoom[0], slide.zoom[1]], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.ease),
  });
  const panX = interpolate(local, [0, SLIDE_DUR], [0, slide.zoom[2]], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const captionOp = interpolate(
    local,
    [20, 40, SLIDE_DUR - 25, SLIDE_DUR - 10],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ opacity }}>
      <AbsoluteFill style={{ transform: `scale(${scale}) translateX(${panX}px)` }}>
        <Img
          src={staticFile(slide.src)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            filter: 'saturate(1.18) contrast(1.05) brightness(1.02)',
          }}
        />
      </AbsoluteFill>

      {/* Pink cinematic grade */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(135deg, rgba(255,140,180,0.34) 0%, rgba(150,120,255,0.22) 100%)',
          mixBlendMode: 'soft-light',
        }}
      />
      {/* Vignette */}
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(0,0,0,0.6) 100%)',
        }}
      />
      {/* Bottom scrim + caption */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(0,0,0,0) 62%, rgba(0,0,0,0.75) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 190,
          width: '100%',
          textAlign: 'center',
          opacity: captionOp,
          color: '#fff',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'italic',
          fontSize: 62,
          letterSpacing: 1,
          textShadow: '0 2px 20px rgba(0,0,0,0.7)',
        }}
      >
        {slide.caption}
      </div>
    </AbsoluteFill>
  );
};

const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [4, 22, 46, 60], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const y = interpolate(frame, [4, 30], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  });
  if (frame > 62) return null;
  return (
    <AbsoluteFill
      style={{ justifyContent: 'center', alignItems: 'center', opacity: op }}
    >
      <div style={{ transform: `translateY(${y}px)`, textAlign: 'center' }}>
        <div
          style={{
            color: '#fff',
            fontFamily: 'Arial Black, sans-serif',
            fontWeight: 900,
            fontSize: 130,
            lineHeight: 0.95,
            letterSpacing: -3,
            textShadow: '0 4px 30px rgba(0,0,0,0.6)',
          }}
        >
          ALPHA
          <br />
          ELECTRIC
        </div>
        <div
          style={{
            marginTop: 26,
            color: '#FFC2D6',
            fontFamily: 'Georgia, serif',
            fontStyle: 'italic',
            fontSize: 50,
            letterSpacing: 2,
          }}
        >
          run with the pack
        </div>
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ startFrame: number }> = ({ startFrame }) => {
  const frame = useCurrentFrame();
  const local = frame - startFrame;
  if (local < 0) return null;
  const dim = interpolate(local, [0, 25], [0, 0.82], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const op = interpolate(local, [10, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ backgroundColor: `rgba(8,8,10,${dim})` }} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          opacity: op,
          textAlign: 'center',
        }}
      >
        <div>
          <div
            style={{
              color: '#fff',
              fontFamily: 'Arial Black, sans-serif',
              fontWeight: 900,
              fontSize: 92,
              letterSpacing: -2,
            }}
          >
            ALPHA ELECTRIC BIKES
          </div>
          <div
            style={{
              marginTop: 22,
              display: 'inline-block',
              backgroundColor: '#FF2D6B',
              color: '#fff',
              fontFamily: 'Arial, sans-serif',
              fontWeight: 800,
              fontSize: 54,
              padding: '12px 28px',
              borderRadius: 8,
            }}
          >
            $49 DOWN · NO CREDIT NEEDED
          </div>
          <div
            style={{
              marginTop: 30,
              color: '#ddd',
              fontFamily: 'Arial, sans-serif',
              fontWeight: 600,
              fontSize: 44,
            }}
          >
            📍 Kissimmee, FL · (321) 390-2885
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const AestheticMontage: React.FC = () => {
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {SLIDES.map((slide, i) => (
        <KenBurnsSlide key={slide.src} slide={slide} start={i * STEP} />
      ))}
      <TitleCard />
      <EndCard startFrame={durationInFrames - 70} />
    </AbsoluteFill>
  );
};
