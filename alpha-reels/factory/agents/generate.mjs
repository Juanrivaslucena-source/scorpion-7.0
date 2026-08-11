// factory/agents/generate.mjs
//
// The Generation agent looks at the shotlist and, for any beat marked
// source:"generate", tries to create a brand-new AI video clip via Higgsfield.
//
// - engine OFF      → logs what it WOULD make (generate.request.json), the reel
//                     is built from real footage. Nothing stalls.
// - engine ON, bridge → writes a request into the job's gen/ queue; if a clip
//                     (or result URL) has been dropped back, it imports it. See
//                     factory/FULFILL.md for how Jarvis/Claude fulfils it.
// - engine ON, rest → calls Higgsfield's HTTP API directly and downloads it.

import path from 'node:path';
import { makeLog } from '../lib/log.mjs';
import { generateClip, generateEnabled } from '../lib/higgsfield.mjs';
import { writeArtifact, note } from '../lib/jobs.mjs';

const log = makeLog('generate');

export async function generate(state, idea) {
  const wanted = idea.shotlist.filter((s) => s.source === 'generate' && s.genPrompt);
  if (!wanted.length) {
    log.info('no AI shots requested by the idea — skipping');
    const empty = { generated: [], requested: [], pending: [], engineOn: generateEnabled() };
    writeArtifact(state, 'generation', 'generation.json', empty);
    note(state, 'generate: none requested');
    return empty;
  }

  log.step(`${wanted.length} AI shot(s) requested — engine ${generateEnabled() ? 'ON' : 'off'}`);
  const queueDir = path.join(state.dir, 'gen');
  const generated = [];
  const requested = [];
  const pending = [];

  for (let i = 0; i < wanted.length; i++) {
    const s = wanted[i];
    const outPath = path.join(state.dir, 'frames', `gen-${String(i).padStart(2, '0')}.mp4`);
    let res;
    try {
      res = await generateClip({ prompt: s.genPrompt, seconds: s.seconds, outPath, queueDir });
    } catch (e) {
      log.warn('generation error, falling back to input footage:', e.message);
      res = { ok: false, requested: { prompt: s.genPrompt, seconds: s.seconds, outPath } };
    }
    if (res.ok) {
      log.ok('generated:', s.beat);
      generated.push({ beat: s.beat, path: path.relative(state.dir, res.path) });
    } else if (res.pending) {
      log.warn('queued for Jarvis/Claude to fulfil:', s.beat);
      pending.push({ beat: s.beat, prompt: s.genPrompt });
    } else {
      log.info('engine off — logged request:', s.beat);
      requested.push(res.requested);
    }
  }

  const summary = { generated, requested, pending, engineOn: generateEnabled() };
  writeArtifact(state, 'generation', 'generation.json', summary);
  if (requested.length || pending.length) {
    writeArtifact(state, 'generateRequest', 'generate.request.json', {
      note: 'AI shots the idea wanted. Fulfil with Higgsfield and drop mp4s (or .url files) into gen/, then re-run to upgrade the reel.',
      pending,
      requested,
    });
  }
  note(state, `generate: ${generated.length} made, ${pending.length} pending, ${requested.length} logged`);
  return summary;
}

export default generate;
