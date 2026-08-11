// factory/lib/higgsfield.mjs
//
// The Generation agent's engine: brand-new AI b-roll shots and the virality
// score. This is an ADAPTER with a clear interface. It ships "off" and returns
// safe stubs so the pipeline runs without it. Wire it to real Higgsfield in one
// of two ways:
//
//   (A) HTTP API  — set HIGGSFIELD_ENABLED=1 and HIGGSFIELD_API_KEY=... and fill
//       in the fetch() calls below to hit Higgsfield's REST endpoints.
//   (B) Jarvis/Claude MCP — leave this off and let the Jarvis agent (which has
//       the Higgsfield MCP tools) fulfil the `generate.request.json` the
//       Generation agent writes into the job folder, then drop the resulting
//       mp4s into the job's frames/ or public stage dir. The orchestrator picks
//       up whatever clips exist.
//
// Either way, the rest of the factory doesn't change.

import { config } from '../config.mjs';

export const generateEnabled = () => config.engines.generate.enabled;

// Ask for a short AI video clip from a text prompt.
// Returns { ok, path?, requested? }.
export async function generateClip({ prompt, seconds = 4, outPath }) {
  if (!generateEnabled()) {
    // Off: record the request so a human/Jarvis can fulfil it, and let the
    // pipeline continue with existing footage.
    return { ok: false, requested: { prompt, seconds, outPath } };
  }
  // --- (A) HTTP path — fill in for your Higgsfield account ------------------
  // const res = await fetch('https://api.higgsfield.ai/v1/video', {
  //   method: 'POST',
  //   headers: {
  //     'authorization': `Bearer ${process.env.HIGGSFIELD_API_KEY}`,
  //     'content-type': 'application/json',
  //   },
  //   body: JSON.stringify({ prompt, duration: seconds, aspect_ratio: '9:16' }),
  // });
  // ... poll for completion, download the mp4 to outPath ...
  // return { ok: true, path: outPath };
  throw new Error('Higgsfield HTTP path not configured — see factory/lib/higgsfield.mjs');
}

// Predict a virality / engagement score for a finished reel. 0..100.
// Returns { score, notes }.
export async function viralityScore({ videoPath, caption }) {
  if (!generateEnabled()) {
    // Local heuristic so QC still gives useful signal with no engine:
    // reward a strong short caption with a hook and a CTA.
    const words = (caption || '').split(/\s+/).filter(Boolean).length;
    let score = 55;
    if (/\?|!|\bnew\b|\bdrop|\bfinanc/i.test(caption || '')) score += 12; // hook energy
    if (words >= 4 && words <= 14) score += 10; // punchy length
    if ((caption || '').includes('#')) score += 6; // has tags
    return { score: Math.min(95, score), notes: 'local heuristic (Higgsfield off)' };
  }
  // Real Higgsfield virality_predictor would go here.
  return { score: 70, notes: 'higgsfield' };
}

export default { generateClip, viralityScore, generateEnabled };
