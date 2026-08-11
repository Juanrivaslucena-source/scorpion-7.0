// factory/agents/dissect.mjs
//
// The Dissect agent pulls the raw input apart so every downstream agent can
// "see" it: how long it is, its shape, and a handful of still frames sampled
// across the clip (a contact sheet). For an image, it's a single still.

import path from 'node:path';
import { makeLog } from '../lib/log.mjs';
import { probe, extractFrames } from '../lib/ffmpeg.mjs';
import { writeArtifact, note } from '../lib/jobs.mjs';

const log = makeLog('dissect');

export async function dissect(state) {
  log.step('inspecting', state.source.originalName);
  const framesDir = path.join(state.dir, 'frames');

  let meta;
  let frames = [];

  if (state.source.kind === 'video') {
    meta = probe(state.source.path);
    log.info(
      `duration ${meta.seconds || '?'}s · ${meta.width}x${meta.height} · ${meta.fps}fps · audio ${
        meta.hasAudio ? 'yes' : 'no'
      }`
    );
    frames = extractFrames(state.source.path, framesDir, 6, meta.seconds);
    if (!frames.length) log.warn('no frames extracted (ffmpeg unavailable?) — continuing on metadata only');
    else log.ok(`sampled ${frames.length} keyframes`);
  } else {
    // Image: it *is* the frame.
    meta = { seconds: 0, width: 1080, height: 1920, fps: 30, hasAudio: false, ok: true };
    frames = [state.source.path];
    log.ok('single image registered as source frame');
  }

  // Rough orientation guess helps the Edit agent decide crop vs letterbox.
  const orientation =
    meta.width && meta.height
      ? meta.width > meta.height
        ? 'landscape'
        : meta.height > meta.width
        ? 'portrait'
        : 'square'
      : 'unknown';

  const dissection = {
    kind: state.source.kind,
    duration: meta.seconds,
    width: meta.width,
    height: meta.height,
    fps: meta.fps,
    hasAudio: meta.hasAudio,
    orientation,
    needsCropToVertical: orientation !== 'portrait',
    frames: frames.map((f) => path.relative(state.dir, f)),
    frameCount: frames.length,
  };

  writeArtifact(state, 'dissection', 'dissection.json', dissection);
  note(state, `dissect: ${state.source.kind}, ${meta.seconds || 0}s, ${orientation}`);
  return dissection;
}

export default dissect;
