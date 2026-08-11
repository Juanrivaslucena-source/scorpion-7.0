// factory/coach.mjs
//
// The learning loop. Every time you approve or reject a reel, the Coach records
// it, updates a "taste profile" of what you like, and — crucially — scores how
// often it could have PREDICTED your call. When it's seen enough reels AND is
// predicting you accurately AND the training window has passed, it flips the
// factory to autopilot (no more approval stops) on its own.
//
// The whole point: ~6 weeks of you tapping approve/reject teaches the agents
// what you would and wouldn't post, then they run it for you.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { ask, claudeAvailable } from './lib/claude.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, 'taste');
const LEDGER = path.join(DIR, 'decisions.jsonl');
const STATE = path.join(DIR, 'state.json');
const PROFILE = path.join(DIR, 'profile.md');

// ----- The goal ------------------------------------------------------------
// Set the day the coaching started and the target autopilot date (~6 weeks).
export const GOAL = {
  startedAt: config.goal?.startedAt || '2026-08-11',
  windowDays: config.goal?.windowDays ?? 45, // "about a month and a half"
  minDecisions: config.goal?.minDecisions ?? 40, // need enough examples
  accuracyTarget: config.goal?.accuracyTarget ?? 0.9, // predict your call 90%+
  autoActivate: config.goal?.autoActivate ?? true, // flip to autopilot when ready
};

function ensure() {
  fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify({ autopilot: false }, null, 2));
}
export function loadState() {
  ensure();
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}
function saveState(s) {
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}
export function ledger() {
  ensure();
  if (!fs.existsSync(LEDGER)) return [];
  return fs
    .readFileSync(LEDGER, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

// ----- Record a decision ---------------------------------------------------
// verdict: 'approved' | 'rejected'. Also stores whatever we predicted so we can
// measure accuracy over time.
export function recordDecision(state, verdict, reason = '') {
  ensure();
  const idea = readIdea(state);
  const row = {
    t: new Date().toISOString(),
    jobId: state.id,
    verdict,
    reason,
    predicted: state.taste?.predicted || null,
    predictedConf: state.taste?.predictedConf ?? null,
    idea: idea
      ? { hook: idea.hook, concept: idea.concept, caption: idea.caption, shots: (idea.shotlist || []).map((s) => s.beat) }
      : null,
  };
  fs.appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  return row;
}

// ----- Predict whether YOU would approve a given idea ----------------------
// Returns { verdict, confidence, why }. Uses Claude with your history when
// available, else a keyword-lean heuristic from past decisions.
export async function predict(idea) {
  const rows = ledger();
  if (rows.length < 3) return { verdict: 'unknown', confidence: 0, why: 'not enough history yet' };

  if (claudeAvailable()) {
    try {
      const hist = rows
        .slice(-30)
        .map((r) => `- ${r.verdict.toUpperCase()}: hook "${r.idea?.hook}" — ${r.idea?.concept}${r.reason ? ` (you said: ${r.reason})` : ''}`)
        .join('\n');
      const out = await ask(
        `Based on this creator's past approve/reject decisions, will they APPROVE this new reel idea? Answer strictly as: VERDICT|CONFIDENCE(0-100)|one short reason.\n\nHistory:\n${hist}\n\nNew idea: hook "${idea.hook}" — ${idea.concept}`,
        { fast: true, maxTokens: 120 }
      );
      const [v, c, ...why] = out.trim().split('|');
      const verdict = /approve/i.test(v) ? 'approved' : 'rejected';
      return { verdict, confidence: Math.min(100, Number(c) || 60) / 100, why: (why.join('|') || '').trim() };
    } catch {
      /* fall through to heuristic */
    }
  }
  return heuristicPredict(idea, rows);
}

function heuristicPredict(idea, rows) {
  const tok = (s) => String(s || '').toLowerCase().match(/[a-z0-9']+/g) || [];
  const good = new Map();
  const bad = new Map();
  for (const r of rows) {
    const words = [...tok(r.idea?.hook), ...tok(r.idea?.concept)];
    const m = r.verdict === 'approved' ? good : bad;
    for (const w of words) m.set(w, (m.get(w) || 0) + 1);
  }
  let score = 0;
  for (const w of [...tok(idea.hook), ...tok(idea.concept)]) score += (good.get(w) || 0) - (bad.get(w) || 0);
  const approveRate = rows.filter((r) => r.verdict === 'approved').length / rows.length;
  const verdict = score >= 0 ? 'approved' : 'rejected';
  const confidence = Math.min(0.85, 0.5 + Math.abs(score) / 20);
  return { verdict, confidence, why: `pattern score ${score}, base approve-rate ${(approveRate * 100) | 0}%` };
}

// ----- Progress toward the goal -------------------------------------------
export function readiness() {
  const rows = ledger();
  const total = rows.length;
  const withPred = rows.filter((r) => r.predicted && r.predicted !== 'unknown');
  const correct = withPred.filter((r) => r.predicted === r.verdict).length;
  const recent = withPred.slice(-20);
  const recentCorrect = recent.filter((r) => r.predicted === r.verdict).length;
  const accuracy = recent.length ? recentCorrect / recent.length : 0;

  const start = new Date(GOAL.startedAt);
  const now = new Date();
  const daysElapsed = Math.max(0, Math.floor((now - start) / 86400000));
  const targetDate = new Date(start.getTime() + GOAL.windowDays * 86400000);

  const gates = {
    enoughDecisions: total >= GOAL.minDecisions,
    accurateEnough: recent.length >= 10 && accuracy >= GOAL.accuracyTarget,
    windowElapsed: daysElapsed >= GOAL.windowDays,
  };
  const ready = gates.enoughDecisions && gates.accurateEnough && gates.windowElapsed;

  return {
    total,
    approvals: rows.filter((r) => r.verdict === 'approved').length,
    rejections: rows.filter((r) => r.verdict === 'rejected').length,
    predictionsScored: withPred.length,
    lifetimeAccuracy: withPred.length ? correct / withPred.length : 0,
    recentAccuracy: accuracy,
    daysElapsed,
    windowDays: GOAL.windowDays,
    targetDate: targetDate.toISOString().slice(0, 10),
    minDecisions: GOAL.minDecisions,
    accuracyTarget: GOAL.accuracyTarget,
    gates,
    ready,
    autopilot: loadState().autopilot,
  };
}

// Effective approval mode: 'none' once autopilot is engaged, else your config.
export function effectiveApprovals() {
  return loadState().autopilot ? 'none' : config.approvals;
}

// Called after each decision: engage autopilot if the goal is met.
export function maybeEngageAutopilot(log) {
  const r = readiness();
  const s = loadState();
  if (GOAL.autoActivate && r.ready && !s.autopilot) {
    s.autopilot = true;
    s.engagedAt = new Date().toISOString();
    saveState(s);
    if (log) log.ok('🎯 GOAL MET — autopilot engaged. The factory will post-ready reels without asking.');
    return true;
  }
  return false;
}

// Rebuild a human-readable taste profile (nice to glance at; optional).
export async function rebuildProfile() {
  const rows = ledger();
  if (!rows.length) return;
  let body;
  if (claudeAvailable()) {
    const hist = rows.slice(-40).map((r) => `${r.verdict.toUpperCase()}: "${r.idea?.hook}" — ${r.idea?.concept}`).join('\n');
    body = await ask(`Summarise this creator's reel taste in 6 bullet points (what they approve vs reject):\n${hist}`, {
      fast: true,
      maxTokens: 400,
    });
  } else {
    const a = rows.filter((r) => r.verdict === 'approved').length;
    body = `- Decisions so far: ${rows.length} (${a} approved, ${rows.length - a} rejected)\n- Turn on ANTHROPIC_API_KEY for a written taste summary.`;
  }
  fs.writeFileSync(PROFILE, `# Your reel taste (learned)\n\n${body}\n`);
}

function readIdea(state) {
  try {
    return JSON.parse(fs.readFileSync(state.artifacts.idea, 'utf8'));
  } catch {
    return null;
  }
}

export default { recordDecision, predict, readiness, effectiveApprovals, maybeEngageAutopilot, rebuildProfile, GOAL };
