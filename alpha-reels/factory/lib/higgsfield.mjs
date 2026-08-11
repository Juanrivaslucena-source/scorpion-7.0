// factory/lib/higgsfield.mjs
//
// The Generation agent's engine: brand-new AI b-roll shots + virality scoring.
//
// PROVEN FLOW (verified against a real Higgsfield account):
//   generate_video { model:'seedance_2_5', aspect_ratio:'9:16', duration } →
//   poll until completed → download the result mp4 URL to disk.
//   (A 5s 9:16 seedance_2_5 clip costs ~32.5 credits.)
//
// Because Higgsfield generation runs through the Higgsfield MCP (which the
// Jarvis/Claude agent holds), there are two ways to wire it — pick with
// HIGGSFIELD_MODE:
//
//   'bridge' (default when enabled): the agent writes a request file and the
//       Jarvis/Claude side (which has the Higgsfield MCP) fulfils it by dropping
//       the finished clip — or just its result URL — back. See factory/FULFILL.md.
//
//   'rest': call Higgsfield's HTTP API directly with HIGGSFIELD_API_KEY. Fill in
//       your endpoint below. Use this for a standalone always-on server.
//
// Either way, importUrl() turns a finished clip URL into a local mp4.

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.mjs';

export const generateEnabled = () => config.engines.generate.enabled;
const MODE = process.env.HIGGSFIELD_MODE || 'bridge';
const MODEL = process.env.HIGGSFIELD_MODEL || 'seedance_2_5';

// Download a finished clip URL (e.g. the CloudFront result_url) to outPath.
export async function importUrl(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  return outPath;
}

// Ask for a short AI video clip from a text prompt.
// Returns { ok, path? , requested? , pending? }.
export async function generateClip({ prompt, seconds = 5, outPath, queueDir }) {
  if (!generateEnabled()) {
    return { ok: false, requested: { prompt, seconds, outPath } };
  }

  if (MODE === 'rest') {
    return generateViaRest({ prompt, seconds, outPath });
  }

  // --- bridge mode ---------------------------------------------------------
  // 1) If a fulfilment already exists, import it and we're done.
  //    Accepts either a dropped mp4 (<name>.mp4) or a URL file (<name>.url).
  const base = path.basename(outPath).replace(/\.mp4$/, '');
  const doneMp4 = path.join(queueDir, `${base}.mp4`);
  const doneUrl = path.join(queueDir, `${base}.url`);
  if (fs.existsSync(doneMp4)) {
    fs.copyFileSync(doneMp4, outPath);
    return { ok: true, path: outPath };
  }
  if (fs.existsSync(doneUrl)) {
    const url = fs.readFileSync(doneUrl, 'utf8').trim();
    await importUrl(url, outPath);
    return { ok: true, path: outPath };
  }
  // 2) Not fulfilled yet — write/refresh the request for the Jarvis/Claude side.
  fs.mkdirSync(queueDir, { recursive: true });
  fs.writeFileSync(
    path.join(queueDir, `${base}.request.json`),
    JSON.stringify(
      { model: MODEL, prompt, aspect_ratio: '9:16', duration: seconds, dropAs: `${base}.mp4 (or ${base}.url)` },
      null,
      2
    )
  );
  return { ok: false, pending: true, requested: { prompt, seconds, outPath } };
}

// Direct HTTP path. Endpoints intentionally left for you to confirm against your
// Higgsfield account/API docs — the request/poll/download shape is sketched.
async function generateViaRest({ prompt, seconds, outPath }) {
  const key = process.env.HIGGSFIELD_API_KEY;
  if (!key) throw new Error('HIGGSFIELD_MODE=rest but HIGGSFIELD_API_KEY is not set');
  const base = process.env.HIGGSFIELD_API_BASE || 'https://api.higgsfield.ai';
  // 1) submit
  const submit = await fetch(`${base}/v1/videos`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, aspect_ratio: '9:16', duration: seconds }),
  });
  if (!submit.ok) throw new Error(`Higgsfield submit failed: ${submit.status}`);
  const { id } = await submit.json();
  // 2) poll
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await fetch(`${base}/v1/videos/${id}`, { headers: { authorization: `Bearer ${key}` } });
    const j = await st.json();
    if (j.status === 'completed' && (j.result_url || j.results?.rawUrl)) {
      await importUrl(j.result_url || j.results.rawUrl, outPath);
      return { ok: true, path: outPath };
    }
    if (j.status === 'failed') throw new Error('Higgsfield generation failed');
  }
  throw new Error('Higgsfield generation timed out');
}

// Predict a virality / engagement score for a finished reel. 0..100.
export async function viralityScore({ videoPath, caption }) {
  // Higgsfield's virality_predictor runs through the MCP; when generation isn't
  // wired we use a local heuristic so QC still gives useful signal.
  const words = (caption || '').split(/\s+/).filter(Boolean).length;
  let score = 55;
  if (/\?|!|\bnew\b|\bdrop|\bfinanc/i.test(caption || '')) score += 12;
  if (words >= 4 && words <= 14) score += 10;
  if ((caption || '').includes('#')) score += 6;
  return { score: Math.min(95, score), notes: generateEnabled() ? 'heuristic (wire virality_predictor for real scores)' : 'local heuristic (Higgsfield off)' };
}

export default { generateClip, viralityScore, generateEnabled, importUrl };
