// factory/orchestrator.mjs
//
// The conductor. Runs the agents in order and handles the approval gate. It is
// RESUMABLE: it figures out where a job is from what's on disk, so it can pause
// for your OK (writing a PROPOSAL.md) and pick up exactly where it stopped when
// you approve.
//
//   dissect → idea → [APPROVAL] → generate → edit → (approval) → stitch → qc → done

import fs from 'node:fs';
import path from 'node:path';
import { makeLog } from './lib/log.mjs';
import { config } from './config.mjs';
import { save, note } from './lib/jobs.mjs';

import dissect from './agents/dissect.mjs';
import idea from './agents/idea.mjs';
import generate from './agents/generate.mjs';
import edit from './agents/edit.mjs';
import stitch from './agents/stitch.mjs';
import qc from './agents/qc.mjs';
import * as coach from './coach.mjs';

const log = makeLog('orchestrator');
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const has = (state, name) => !!state.artifacts[name] && fs.existsSync(state.artifacts[name]);

export async function runPipeline(state) {
  state.status = 'running';
  save(state);
  try {
    // 1) Dissect ----------------------------------------------------------
    if (!has(state, 'dissection')) await dissect(state);
    const dissection = readJSON(state.artifacts.dissection);

    // 2) Idea -------------------------------------------------------------
    if (!has(state, 'idea')) await idea(state);
    const theIdea = readJSON(state.artifacts.idea);

    // --- APPROVAL GATE (your choice: pause once, after the idea) ---------
    // The Coach may have graduated us to autopilot ('none') once it learned
    // your taste; until then your configured setting applies.
    const approvals = coach.effectiveApprovals();
    if (approvals !== 'none' && state.approvals.idea !== 'approved') {
      // Record what the Coach *would* have decided, so we can score how well it
      // predicts you — this is what unlocks autopilot.
      try {
        const p = await coach.predict(theIdea);
        state.taste = { predicted: p.verdict, predictedConf: p.confidence, why: p.why };
        save(state);
        if (p.verdict !== 'unknown') log.info(`coach's guess: you'll ${p.verdict} (${Math.round(p.confidence * 100)}% — ${p.why})`);
      } catch { /* prediction is best-effort */ }

      writeProposal(state, theIdea);
      state.status = 'awaiting-approval';
      state.stage = 'idea';
      save(state);
      note(state, 'paused for approval after idea');
      log.warn('waiting for your OK on the concept →', path.join(state.dir, 'PROPOSAL.md'));
      log.info(`approve with:  node factory/run.mjs approve ${state.id}`);
      log.info(`reject with:   node factory/run.mjs reject ${state.id}`);
      return { paused: true, gate: 'idea', state };
    }

    // 3) Generate ---------------------------------------------------------
    if (!has(state, 'generation')) await generate(state, theIdea);
    const generation = readJSON(state.artifacts.generation);

    // 4) Edit -------------------------------------------------------------
    if (!has(state, 'edl')) await edit(state, theIdea, dissection, generation);
    const edl = readJSON(state.artifacts.edl);

    // --- optional second gate (only if approvals === 'two') --------------
    if (approvals === 'two' && state.approvals.edit !== 'approved') {
      state.status = 'awaiting-approval';
      state.stage = 'edit';
      save(state);
      log.warn('waiting for your OK on the edit plan →', state.artifacts.edl);
      log.info(`approve with:  node factory/run.mjs approve ${state.id}`);
      return { paused: true, gate: 'edit', state };
    }

    // 5) Stitch -----------------------------------------------------------
    let video = state.artifacts.video;
    if (!has(state, 'video')) video = await stitch(state, edl);

    // 6) QC ---------------------------------------------------------------
    if (!has(state, 'qc')) await qc(state, theIdea, video);
    const report = readJSON(state.artifacts.qc);

    state.status = 'done';
    state.stage = 'done';
    save(state);
    log.ok(`DONE → ${video}  (virality ${report.viralityScore}/100, ${report.verdict})`);
    return { paused: false, done: true, state, video, report };
  } catch (e) {
    state.status = 'failed';
    save(state);
    note(state, 'failed: ' + e.message);
    log.err(e.message);
    throw e;
  }
}

// Called by run.mjs when you approve a paused job — flips the flag and resumes.
export async function approveAndContinue(state, gate) {
  const which = gate || state.stage || 'idea';
  state.approvals[which] = 'approved';
  save(state);
  // Teach the Coach: this is one more example of what you'd post.
  if (which === 'idea') {
    coach.recordDecision(state, 'approved');
    coach.maybeEngageAutopilot(log);
    coach.rebuildProfile().catch(() => {});
  }
  log.ok('approved — resuming');
  return runPipeline(state);
}

// Called when you reject a paused job — records it as a "would not post" example.
export function rejectJob(state, reason = '') {
  state.status = 'rejected';
  state.approvals[state.stage || 'idea'] = 'rejected';
  save(state);
  coach.recordDecision(state, 'rejected', reason);
  coach.rebuildProfile().catch(() => {});
  log.warn(`rejected — the coach learned from it (${coach.readiness().total} decisions so far)`);
  return state;
}

function writeProposal(state, idea) {
  const md = `# Reel proposal — ${idea.title || state.id}

**Source:** ${state.source.originalName}

**Concept:** ${idea.concept}

**Hook (big on-screen text):** ${idea.hook}
**Subtitle:** ${idea.subtitle || '—'}

**Caption to post:**
${idea.caption}

**Hashtags:** ${(idea.hashtags || []).join(' ')}

**Shotlist:**
${idea.shotlist
  .map((s, i) => `${i + 1}. (${s.seconds}s, ${s.source}) ${s.beat}${s.genPrompt ? `  — AI prompt: "${s.genPrompt}"` : ''}`)
  .join('\n')}

---
Approve → \`node factory/run.mjs approve ${state.id}\`
Reject  → \`node factory/run.mjs reject ${state.id}\`
`;
  fs.writeFileSync(path.join(state.dir, 'PROPOSAL.md'), md);
  state.artifacts.proposal = path.join(state.dir, 'PROPOSAL.md');
  save(state);
}

export default runPipeline;
