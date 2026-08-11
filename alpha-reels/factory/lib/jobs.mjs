// factory/lib/jobs.mjs
//
// A "job" is one input file moving through the pipeline. Everything about it —
// the source, the dissection, the idea, the edit plan, the final video — lives
// in one folder under factory/jobs/<jobId>/. State is a single state.json so the
// pipeline can pause (for your approval) and resume later.

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.mjs';

export const STAGES = ['dissect', 'idea', 'generate', 'edit', 'stitch', 'qc', 'publish'];

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes()
  )}${p(d.getSeconds())}`;
}

export function newJob(sourcePath) {
  const base = path.basename(sourcePath).replace(/\.[^.]+$/, '');
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'clip';
  const id = `${stamp()}-${slug}`.slice(0, 60);
  const dir = path.join(config.paths.jobs, id);
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });

  const kind = /\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(sourcePath) ? 'video' : 'image';
  const src = path.join(dir, 'source' + path.extname(sourcePath));
  fs.copyFileSync(sourcePath, src);

  const state = {
    id,
    dir,
    createdAt: new Date().toISOString(),
    source: { path: src, kind, originalName: path.basename(sourcePath) },
    status: 'created', // created -> running -> awaiting-approval -> running -> done | failed
    stage: null, // current/last stage
    approvals: {}, // e.g. { idea: 'approved' | 'rejected' }
    artifacts: {}, // filled in by each agent (dissection, idea, edl, video, qc...)
    log: [],
  };
  save(state);
  return state;
}

export function jobDir(id) {
  return path.join(config.paths.jobs, id);
}

export function load(id) {
  const p = path.join(jobDir(id), 'state.json');
  if (!fs.existsSync(p)) throw new Error(`No job named "${id}"`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function save(state) {
  fs.writeFileSync(path.join(state.dir, 'state.json'), JSON.stringify(state, null, 2));
  return state;
}

export function note(state, msg) {
  state.log.push({ t: new Date().toISOString(), msg });
  return save(state);
}

// Write a named artifact file into the job folder and record its path.
export function writeArtifact(state, name, filename, contents) {
  const p = path.join(state.dir, filename);
  fs.writeFileSync(p, typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2));
  state.artifacts[name] = p;
  save(state);
  return p;
}

export function listJobs() {
  if (!fs.existsSync(config.paths.jobs)) return [];
  return fs
    .readdirSync(config.paths.jobs)
    .filter((d) => fs.existsSync(path.join(config.paths.jobs, d, 'state.json')))
    .map((d) => load(d))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export default { newJob, load, save, note, writeArtifact, listJobs, jobDir, STAGES };
