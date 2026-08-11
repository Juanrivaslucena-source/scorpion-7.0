// factory/agents/stitch.mjs
//
// The Stitching agent renders the final vertical reel. It hands the EDL to the
// Remotion "FactoryReel" composition (src/FactoryReel.tsx) and calls the
// Remotion renderer to produce the MP4. Remotion bundles its own ffmpeg, so no
// separate install is needed.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeLog } from '../lib/log.mjs';
import { config, ROOT } from '../config.mjs';
import { note, save } from '../lib/jobs.mjs';

const log = makeLog('stitch');

export async function stitch(state, edl) {
  log.step('rendering the reel');
  fs.mkdirSync(config.paths.out, { recursive: true });
  const outFile = path.join(config.paths.out, `${state.id}.mp4`);
  const propsFile = state.artifacts.edl; // edl.json written by the edit agent

  const args = [
    'remotion', 'render',
    'src/index.ts',
    'FactoryReel',
    outFile,
    `--props=${propsFile}`,
    '--log=error',
  ];
  // In this container the full Chrome binary rejects headless; prefer the
  // headless-shell if present (same note as RENDERING.md).
  const shell = findHeadlessShell();
  if (shell) args.push(`--browser-executable=${shell}`);

  log.info('npx', args.join(' '));
  const res = spawnSync('npx', args, { cwd: ROOT, encoding: 'utf8', stdio: 'inherit' });

  if (res.status !== 0 || !fs.existsSync(outFile)) {
    log.err('render failed');
    note(state, 'stitch: render FAILED');
    throw new Error('Remotion render failed — see output above');
  }

  state.artifacts.video = outFile;
  save(state);
  note(state, `stitch: rendered ${path.basename(outFile)}`);
  log.ok('reel rendered →', outFile);
  return outFile;
}

function findHeadlessShell() {
  if (process.env.REMOTION_CHROME) return process.env.REMOTION_CHROME;
  const base = '/opt/pw-browsers';
  try {
    const dir = fs
      .readdirSync(base)
      .find((d) => d.startsWith('chromium_headless_shell'));
    if (dir) {
      const p = path.join(base, dir, 'chrome-linux', 'headless_shell');
      if (fs.existsSync(p)) return p;
    }
  } catch {
    /* not in this env */
  }
  return null;
}

export default stitch;
