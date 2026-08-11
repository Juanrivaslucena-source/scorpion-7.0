#!/usr/bin/env node
// factory/server.mjs — the Reel Factory dashboard server.
//
// A tiny zero-dependency HTTP server (Node's built-in http only) that lets you
// upload a clip in the browser, watch the six agents work, approve the concept,
// and play the finished reel. Start it with:
//
//   node factory/server.mjs            # then open http://localhost:4310
//
// It drives the exact same pipeline as the CLI — jobs are shared on disk.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { newJob, load, listJobs } from './lib/jobs.mjs';
import { runPipeline, approveAndContinue } from './orchestrator.mjs';
import { makeLog } from './lib/log.mjs';

const log = makeLog('orchestrator');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4310);
const running = new Set(); // jobIds currently executing, so we don't double-run

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

// Run the pipeline in the background; the browser polls state to follow along.
function runAsync(state, fn) {
  if (running.has(state.id)) return;
  running.add(state.id);
  Promise.resolve()
    .then(fn)
    .catch((e) => log.err(e.message))
    .finally(() => running.delete(state.id));
}

// Pull the human-facing bits out of a job for the UI.
function summarise(state) {
  const read = (p) => (p && fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
  const idea = read(state.artifacts.idea);
  const qc = read(state.artifacts.qc);
  const done = ['dissect', 'idea', 'generate', 'edit', 'stitch', 'qc'].filter((s) => {
    const map = { dissect: 'dissection', idea: 'idea', generate: 'generation', edit: 'edl', stitch: 'video', qc: 'qc' };
    return state.artifacts[map[s]];
  });
  return {
    id: state.id,
    status: state.status,
    stage: state.stage,
    source: state.source.originalName,
    kind: state.source.kind,
    running: running.has(state.id),
    completedStages: done,
    hook: idea?.hook || '',
    concept: idea?.concept || '',
    caption: idea?.caption || '',
    hashtags: idea?.hashtags || [],
    shotlist: idea?.shotlist || [],
    virality: qc?.viralityScore ?? null,
    verdict: qc?.verdict || '',
    hasVideo: !!state.artifacts.video && fs.existsSync(state.artifacts.video),
    awaitingApproval: state.status === 'awaiting-approval',
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    // --- Dashboard page ---------------------------------------------------
    if (p === '/' || p === '/index.html') {
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'dashboard.html')), 'text/html');
    }

    // --- List jobs --------------------------------------------------------
    if (p === '/api/jobs' && req.method === 'GET') {
      return send(res, 200, { jobs: listJobs().map(summarise), engines: engineStatus() });
    }

    // --- One job ----------------------------------------------------------
    let m;
    if ((m = p.match(/^\/api\/jobs\/([^/]+)$/)) && req.method === 'GET') {
      return send(res, 200, summarise(load(decodeURIComponent(m[1]))));
    }

    // --- Upload a new clip (raw body, filename in ?name=) ------------------
    if (p === '/api/upload' && req.method === 'POST') {
      const name = (url.searchParams.get('name') || 'clip.mp4').replace(/[^\w.-]/g, '_');
      fs.mkdirSync(config.paths.inbox, { recursive: true });
      const tmp = path.join(config.paths.inbox, `${Date.now()}-${name}`);
      const out = fs.createWriteStream(tmp);
      req.pipe(out);
      await new Promise((r, j) => (out.on('finish', r), out.on('error', j)));
      const state = newJob(tmp);
      fs.rmSync(tmp, { force: true });
      runAsync(state, () => runPipeline(state));
      return send(res, 200, { id: state.id });
    }

    // --- Approve / reject -------------------------------------------------
    if ((m = p.match(/^\/api\/jobs\/([^/]+)\/approve$/)) && req.method === 'POST') {
      const state = load(decodeURIComponent(m[1]));
      runAsync(state, () => approveAndContinue(state, state.stage || 'idea'));
      return send(res, 200, { ok: true });
    }
    if ((m = p.match(/^\/api\/jobs\/([^/]+)\/reject$/)) && req.method === 'POST') {
      const state = load(decodeURIComponent(m[1]));
      state.status = 'rejected';
      fs.writeFileSync(path.join(state.dir, 'state.json'), JSON.stringify(state, null, 2));
      return send(res, 200, { ok: true });
    }

    // --- Stream the finished reel ----------------------------------------
    if ((m = p.match(/^\/api\/jobs\/([^/]+)\/video$/)) && req.method === 'GET') {
      const state = load(decodeURIComponent(m[1]));
      const file = state.artifacts.video;
      if (!file || !fs.existsSync(file)) return send(res, 404, { error: 'no video yet' });
      const size = fs.statSync(file).size;
      const range = req.headers.range;
      if (range) {
        const [s, e] = range.replace('bytes=', '').split('-');
        const start = Number(s);
        const end = e ? Number(e) : size - 1;
        res.writeHead(206, {
          'content-range': `bytes ${start}-${end}/${size}`,
          'accept-ranges': 'bytes',
          'content-length': end - start + 1,
          'content-type': 'video/mp4',
        });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'content-length': size, 'content-type': 'video/mp4', 'accept-ranges': 'bytes' });
      return fs.createReadStream(file).pipe(res);
    }

    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

function engineStatus() {
  return {
    claude: config.engines.claude.enabled,
    generate: config.engines.generate.enabled,
    approvals: config.approvals,
    brand: config.brand.name,
  };
}

server.listen(PORT, () => {
  log.ok(`Reel Factory dashboard → http://localhost:${PORT}`);
  log.info(`brand: ${config.brand.name} · Claude: ${config.engines.claude.enabled ? 'on' : 'off'} · AI-gen: ${config.engines.generate.enabled ? 'on' : 'off'}`);
});
