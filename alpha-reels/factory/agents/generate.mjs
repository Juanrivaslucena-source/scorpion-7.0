// factory/agents/generate.mjs
//
// The Generation agent looks at the shotlist and, for any beat marked
// source:"generate", tries to create a brand-new AI video clip (Higgsfield).
// If generation is off, it writes a generate.request.json listing what it
// WOULD make (so Jarvis/you can fulfil it) and the pipeline proceeds using the
// real input footage for those beats.

import path from 'node:path';
import { makeLog } from '../lib/log.mjs';
import { generateClip, generateEnabled } from '../lib/higgsfield.mjs';
import { writeArtifact, note } from '../lib/jobs.mjs';

const log = makeLog('generate');

export async function generate(state, idea) {
  const wanted = idea.shotlist.filter((s) => s.source === 'generate' && s.genPrompt);
  if (!wanted.length) {
    log.info('no AI shots requested by the idea — skipping');
    const empty = { generated: [], requested: [], engineOn: generateEnabled() };
    writeArtifact(state, 'generation', 'generation.json', empty);
    note(state, 'generate: none requested');
    return empty;
  }

  log.step(`${wanted.length} AI shot(s) requested`);
  const generated = [];
  const requested = [];

  for (let i = 0; i < wanted.length; i++) {
    const s = wanted[i];
    const outPath = path.join(state.dir, 'frames', `gen-${String(i).padStart(2, '0')}.mp4`);
    const res = await generateClip({ prompt: s.genPrompt, seconds: s.seconds, outPath });
    if (res.ok) {
      log.ok('generated:', s.beat);
      generated.push({ beat: s.beat, path: path.relative(state.dir, res.path) });
    } else {
      log.warn('generation off — logged request:', s.beat);
      requested.push(res.requested);
    }
  }

  const summary = { generated, requested, engineOn: generateEnabled() };
  writeArtifact(state, 'generation', 'generation.json', summary);
  if (requested.length) {
    writeArtifact(
      state,
      'generateRequest',
      'generate.request.json',
      { note: 'AI shots the idea wanted; fulfil with Higgsfield/Jarvis and drop mp4s into frames/', requested }
    );
  }
  note(state, `generate: ${generated.length} made, ${requested.length} pending`);
  return summary;
}

export default generate;
