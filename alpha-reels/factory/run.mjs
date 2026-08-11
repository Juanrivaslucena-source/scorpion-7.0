#!/usr/bin/env node
// factory/run.mjs — the command-line front door to the Reel Factory.
//
//   node factory/run.mjs new <path/to/video-or-image>   # start a job
//   node factory/run.mjs approve <jobId>                 # OK the concept, finish it
//   node factory/run.mjs reject  <jobId>                 # kill a job
//   node factory/run.mjs list                            # show all jobs
//   node factory/run.mjs status  <jobId>                 # show one job
//   node factory/run.mjs watch                           # watch the inbox folder

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { newJob, load, listJobs } from './lib/jobs.mjs';
import { runPipeline, approveAndContinue } from './orchestrator.mjs';
import { makeLog } from './lib/log.mjs';

const log = makeLog('orchestrator');
const [cmd, arg] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case 'new': {
      if (!arg || !fs.existsSync(arg)) return die(`file not found: ${arg}`);
      const state = newJob(path.resolve(arg));
      log.step(`new job ${state.id}`);
      await runPipeline(state);
      break;
    }
    case 'approve': {
      const state = load(arg);
      await approveAndContinue(state, state.stage || 'idea');
      break;
    }
    case 'reject': {
      const state = load(arg);
      state.status = 'rejected';
      state.approvals[state.stage || 'idea'] = 'rejected';
      fs.writeFileSync(path.join(state.dir, 'state.json'), JSON.stringify(state, null, 2));
      log.warn(`job ${arg} rejected`);
      break;
    }
    case 'list': {
      const jobs = listJobs();
      if (!jobs.length) return log.info('no jobs yet — run:  node factory/run.mjs new <file>');
      for (const j of jobs) {
        const v = j.artifacts.video ? '🎬' : j.status === 'awaiting-approval' ? '⏸' : '·';
        console.log(`${v}  ${j.id.padEnd(40)} ${j.status}`);
      }
      break;
    }
    case 'status': {
      const j = load(arg);
      console.log(JSON.stringify({ id: j.id, status: j.status, stage: j.stage, artifacts: Object.keys(j.artifacts) }, null, 2));
      if (j.artifacts.proposal) console.log('\n' + fs.readFileSync(j.artifacts.proposal, 'utf8'));
      break;
    }
    case 'watch': {
      const { watchInbox } = await import('./watch.mjs');
      await watchInbox();
      break;
    }
    default:
      console.log(`Reel Factory — turn a clip or photo into a ready-to-post reel.

  node factory/run.mjs new <file>       start a job (dissect → idea → pause for OK)
  node factory/run.mjs approve <jobId>  approve the concept and finish the reel
  node factory/run.mjs reject  <jobId>  cancel a job
  node factory/run.mjs list             list jobs
  node factory/run.mjs status  <jobId>  show a job + its proposal
  node factory/run.mjs watch            watch factory/inbox/ and auto-start jobs

Drop files into: ${path.relative(process.cwd(), config.paths.inbox)}
Finished reels land in: ${path.relative(process.cwd(), config.paths.out)}`);
  }
}

function die(msg) {
  log.err(msg);
  process.exit(1);
}

main().catch((e) => die(e.stack || e.message));
