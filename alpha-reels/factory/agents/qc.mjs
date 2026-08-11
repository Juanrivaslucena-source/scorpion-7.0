// factory/agents/qc.mjs
//
// The QC agent is the last gate before "done". It checks the render actually
// exists and is a sane size, then scores the reel for virality/engagement
// (Higgsfield when on, a local heuristic otherwise) and writes a short report.

import fs from 'node:fs';
import { makeLog } from '../lib/log.mjs';
import { viralityScore } from '../lib/higgsfield.mjs';
import { writeArtifact, note } from '../lib/jobs.mjs';

const log = makeLog('qc');

export async function qc(state, idea, videoPath) {
  log.step('quality check');
  const checks = [];

  const exists = fs.existsSync(videoPath);
  const size = exists ? fs.statSync(videoPath).size : 0;
  checks.push({ name: 'file exists', pass: exists });
  checks.push({ name: 'non-trivial size (>50KB)', pass: size > 50_000 });
  checks.push({ name: 'has caption/hook', pass: !!idea.hook });
  checks.push({ name: 'has post caption', pass: !!idea.caption });

  const caption = `${idea.caption || ''} ${(idea.hashtags || []).join(' ')}`.trim();
  const { score, notes } = await viralityScore({ videoPath, caption });

  const passed = checks.every((c) => c.pass);
  const report = {
    passed,
    viralityScore: score,
    viralityNotes: notes,
    sizeBytes: size,
    checks,
    verdict: passed ? (score >= 65 ? 'ship it' : 'ok — could be punchier') : 'needs a re-render',
  };

  writeArtifact(state, 'qc', 'qc.json', report);
  note(state, `qc: ${report.verdict} (virality ${score})`);
  for (const c of checks) (c.pass ? log.ok : log.warn)(c.name);
  log.info(`virality ${score}/100 — ${notes}`);
  log[passed ? 'ok' : 'warn'](report.verdict);
  return report;
}

export default qc;
