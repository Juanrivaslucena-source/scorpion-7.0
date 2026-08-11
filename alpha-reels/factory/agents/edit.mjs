// factory/agents/edit.mjs
//
// The Editing agent turns the creative idea into a concrete EDL (edit decision
// list): the exact sequence of segments the renderer will play — which clip,
// where to start in it, how long, and what caption sits on top and when.
//
// It also STAGES the clips into public/factory/<jobId>/ because Remotion serves
// media from the public/ folder.
//
// Claude (when available) refines in-points and caption timing; otherwise a
// deterministic builder lays the beats out evenly. Either way the output is the
// same shape, so the Stitch agent doesn't care which ran.

import fs from 'node:fs';
import path from 'node:path';
import { makeLog } from '../lib/log.mjs';
import { config } from '../config.mjs';
import { askJSON, claudeAvailable } from '../lib/claude.mjs';
import { writeArtifact, note } from '../lib/jobs.mjs';

const log = makeLog('edit');

function stageDir(jobId) {
  const dir = path.join(config.paths.publicDir, config.paths.stageDirName, jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
// Path relative to public/ that Remotion's staticFile() expects.
function publicRel(jobId, filename) {
  return `${config.paths.stageDirName}/${jobId}/${filename}`;
}

export async function edit(state, idea, dissection, generation) {
  log.step('building the edit plan');
  const { fps, width, height } = config.reel;

  // 1) Stage the source + any generated clips into public/.
  const stage = stageDir(state.id);
  const staged = {}; // logical name -> public-relative path
  const srcExt = path.extname(state.source.path) || (state.source.kind === 'video' ? '.mp4' : '.jpg');
  const srcName = `source${srcExt}`;
  fs.copyFileSync(state.source.path, path.join(stage, srcName));
  staged.input = { rel: publicRel(state.id, srcName), kind: state.source.kind };

  for (const g of generation?.generated || []) {
    const abs = path.join(state.dir, g.path);
    const name = path.basename(g.path);
    if (fs.existsSync(abs)) {
      fs.copyFileSync(abs, path.join(stage, name));
      staged[g.beat] = { rel: publicRel(state.id, name), kind: 'video' };
    }
  }
  // Stage the logo if present in public/ already (Remotion reads it directly).
  const logoRel = fs.existsSync(path.join(config.paths.publicDir, 'logo.png')) ? 'logo.png' : '';

  // 2) Decide per-beat in-points. Ask Claude to pick nice moments if we can.
  const srcDur = dissection.duration || 0;
  let inPoints = null;
  if (claudeAvailable() && state.source.kind === 'video' && srcDur > 2) {
    try {
      const r = await askJSON(
        `A source clip is ${srcDur.toFixed(1)}s long. I need start times (seconds) inside it for ${
          idea.shotlist.length
        } segments of these lengths: ${idea.shotlist
          .map((s) => s.seconds)
          .join(', ')}s. Spread them to avoid dead air and keep energy. Return {"inPoints":[numbers]}.`,
        { fast: true, maxTokens: 300 }
      );
      if (Array.isArray(r.inPoints)) inPoints = r.inPoints.map((n) => Math.max(0, Number(n) || 0));
      log.ok('Claude picked in-points');
    } catch (e) {
      log.warn('in-point refinement skipped:', e.message);
    }
  }

  // 3) Build segments.
  const segments = idea.shotlist.map((beat, i) => {
    const clip = beat.source === 'generate' && staged[beat.beat] ? staged[beat.beat] : staged.input;
    const evenIn = srcDur ? (srcDur * i) / Math.max(1, idea.shotlist.length) : 0;
    const startInClip = clip.kind === 'video' ? (inPoints?.[i] ?? evenIn) : 0;
    // Caption plan: hook on the first beat, subtitle mid, brand payoff last.
    let caption = '';
    let captionStyle = 'sub';
    if (i === 0) {
      caption = idea.hook;
      captionStyle = 'hook';
    } else if (i === idea.shotlist.length - 1) {
      caption = idea.subtitle || config.brand.name;
      captionStyle = 'sub';
    } else if (i === 1) {
      caption = idea.subtitle || '';
      captionStyle = 'sub';
    }
    return {
      clip: clip.rel,
      type: clip.kind, // 'video' | 'image'
      startInClip: Math.round(startInClip * 100) / 100,
      seconds: beat.seconds,
      caption,
      captionStyle,
      logo: i === idea.shotlist.length - 1 ? logoRel : '',
    };
  });

  const totalSeconds = segments.reduce((n, s) => n + s.seconds, 0);
  const edl = {
    jobId: state.id,
    width,
    height,
    fps,
    accent: config.brand.accent,
    totalSeconds,
    totalFrames: Math.round(totalSeconds * fps),
    audio: null, // drop a music/voiceover path here (public-relative) to add sound
    segments,
  };

  writeArtifact(state, 'edl', 'edl.json', edl);
  note(state, `edit: ${segments.length} segments, ${totalSeconds}s total`);
  log.ok(`edit plan ready — ${segments.length} segments, ${totalSeconds}s`);
  return edl;
}

export default edit;
