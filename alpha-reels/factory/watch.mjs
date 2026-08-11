// factory/watch.mjs — the folder-drop entry point.
//
// Watches factory/inbox/ and starts a job whenever a video or image lands there.
// Because approvals are on by default, a new drop runs up to the concept and
// then pauses for your OK (see the PROPOSAL.md it prints). Set approvals:'none'
// in config.mjs for fully hands-off.

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { newJob } from './lib/jobs.mjs';
import { runPipeline } from './orchestrator.mjs';
import { makeLog } from './lib/log.mjs';

const log = makeLog('orchestrator');
const MEDIA = /\.(mp4|mov|webm|mkv|m4v|avi|jpg|jpeg|png|webp)$/i;
const seen = new Set();

async function handle(file) {
  if (seen.has(file)) return;
  seen.add(file);
  // Wait until the file stops growing (finished copying).
  let last = -1;
  for (let i = 0; i < 30; i++) {
    const size = fs.existsSync(file) ? fs.statSync(file).size : -1;
    if (size === last && size > 0) break;
    last = size;
    await new Promise((r) => setTimeout(r, 500));
  }
  log.step('inbox drop:', path.basename(file));
  try {
    const state = newJob(file);
    await runPipeline(state);
    // Move the consumed source out of the inbox so it isn't re-processed.
    fs.renameSync(file, path.join(state.dir, 'inbox-' + path.basename(file)));
  } catch (e) {
    log.err(e.message);
  }
}

export async function watchInbox() {
  fs.mkdirSync(config.paths.inbox, { recursive: true });
  log.ok('watching', config.paths.inbox, '— drop a video or image in to start');
  // Process anything already sitting there.
  for (const f of fs.readdirSync(config.paths.inbox)) {
    if (MEDIA.test(f)) await handle(path.join(config.paths.inbox, f));
  }
  fs.watch(config.paths.inbox, (_e, filename) => {
    if (filename && MEDIA.test(filename)) {
      handle(path.join(config.paths.inbox, filename)).catch((e) => log.err(e.message));
    }
  });
}

export default watchInbox;
