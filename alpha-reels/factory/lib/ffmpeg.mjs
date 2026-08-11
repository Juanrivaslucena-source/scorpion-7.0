// factory/lib/ffmpeg.mjs
//
// Thin wrappers around ffmpeg/ffprobe. We prefer Remotion's bundled binaries
// (`npx remotion ffprobe` / `npx remotion ffmpeg`) so you don't have to install
// ffmpeg separately. If you DO have system ffmpeg, set FACTORY_FFMPEG=system.

import { spawnSync } from 'node:child_process';
import { ROOT } from '../config.mjs';

const useSystem = process.env.FACTORY_FFMPEG === 'system';

function run(tool, args) {
  const [cmd, baseArgs] = useSystem
    ? [tool, []]
    : ['npx', ['remotion', tool]];
  const res = spawnSync(cmd, [...baseArgs, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return res;
}

// Probe a media file. Returns { seconds, width, height, fps, hasAudio }.
export function probe(file) {
  const res = run('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    file,
  ]);
  const out = (res.stdout || '') + (res.stderr || '');
  const jsonStart = out.indexOf('{');
  let data = {};
  try {
    data = JSON.parse(out.slice(jsonStart));
  } catch {
    // Fall back to safe defaults if probing isn't available in this env.
    return { seconds: 0, width: 1080, height: 1920, fps: 30, hasAudio: false, ok: false };
  }
  const v = (data.streams || []).find((s) => s.codec_type === 'video') || {};
  const a = (data.streams || []).find((s) => s.codec_type === 'audio');
  const [n, d] = String(v.avg_frame_rate || v.r_frame_rate || '30/1').split('/');
  const fps = d && Number(d) ? Number(n) / Number(d) : Number(n) || 30;
  return {
    seconds: Number(data.format?.duration) || Number(v.duration) || 0,
    width: Number(v.width) || 0,
    height: Number(v.height) || 0,
    fps: Math.round(fps * 100) / 100,
    hasAudio: !!a,
    ok: true,
  };
}

// Grab N evenly-spaced still frames from a video into outDir. Returns paths.
export function extractFrames(file, outDir, count = 6, seconds = 0) {
  const dur = seconds || probe(file).seconds || 0;
  const paths = [];
  if (!dur) return paths;
  for (let i = 0; i < count; i++) {
    const t = (dur * (i + 0.5)) / count; // centre of each slice
    const out = `${outDir}/frame-${String(i).padStart(2, '0')}.jpg`;
    const res = run('ffmpeg', [
      '-ss', t.toFixed(2),
      '-i', file,
      '-frames:v', '1',
      '-vf', 'scale=540:-1',
      '-q:v', '4',
      '-y', out,
    ]);
    if (res.status === 0) paths.push(out);
  }
  return paths;
}

export default { probe, extractFrames };
