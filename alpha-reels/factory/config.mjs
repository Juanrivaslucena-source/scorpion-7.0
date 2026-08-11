// factory/config.mjs
//
// One place for all the knobs. Edit this file to change the brand voice, the
// default reel length, which engines are turned on, and where files live.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..'); // the alpha-reels project root

export const config = {
  // ----- Brand -----------------------------------------------------------
  // This is who the reels are for. The Idea agent uses this to write on-brand
  // hooks, scripts and captions. Change it for a different client.
  brand: {
    name: 'Alpha Volt',
    business: 'Alpha Electric Bikes — electric bikes & scooters, Kissimmee FL',
    audience: 'young riders, commuters, and bike-life fans in Central Florida',
    // The voice guide. Keep it short and punchy — it steers the copy.
    voice: [
      'Bold, street, high-energy. Short punchy lines. No corporate filler.',
      'Sell the feeling: freedom, speed, no gas, no traffic, look good doing it.',
      'Always sound like a local shop that actually rides — never like an ad agency.',
    ].join(' '),
    accent: '#c6ff00', // the neon-lime brand accent used on captions
    hashtags: ['#ebike', '#electricbike', '#bikelife', '#kissimmee', '#orlando'],
    cta: 'Financing available — DM to ride today.',
  },

  // ----- Output format ---------------------------------------------------
  reel: {
    width: 1080,
    height: 1920, // 9:16 vertical
    fps: 30,
    targetSeconds: 15, // aim for ~15s reels
    minSeconds: 8,
    maxSeconds: 30,
  },

  // ----- Engines (turn features on/off) ----------------------------------
  // The pipeline runs fine with everything off — it just uses your real
  // footage and template copy. Turn things on as you add keys.
  engines: {
    // Idea + Edit agents: use Claude when a key is present, else a built-in
    // template brain so the pipeline still runs offline.
    claude: {
      enabled: !!process.env.ANTHROPIC_API_KEY,
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      thinkModel: 'claude-opus-4-8', // reasoning-heavy: idea + edit
      fastModel: 'claude-haiku-4-5', // quick/cheap: captions, small calls
    },
    // Generation agent: brand-new AI b-roll. Off unless wired to Higgsfield.
    // See lib/higgsfield.mjs for how to connect it.
    generate: {
      enabled: process.env.HIGGSFIELD_ENABLED === '1',
      provider: 'higgsfield',
    },
    // QC agent: virality score. Uses Higgsfield when generation is on, else a
    // local heuristic.
    qc: { enabled: true },
    // Publish agent: auto-post. Off by default on purpose — you approve posts.
    publish: { enabled: false, provider: 'higgsfield-tiktok' },
  },

  // ----- Control ---------------------------------------------------------
  // 'one'  -> pause once, after the Idea agent, for your OK (your choice).
  // 'two'  -> pause after Idea AND after the rough Edit.
  // 'none' -> fully automatic, no stops.
  // NOTE: once the learning goal below is met, the Coach overrides this to
  // 'none' automatically (autopilot). Until then, your setting stands.
  approvals: 'one',

  // ----- The learning goal ----------------------------------------------
  // You approve/reject reels for ~6 weeks; the Coach learns your taste and,
  // once it can predict your call accurately over enough reels, flips the
  // factory to autopilot on its own. See factory/coach.mjs.
  goal: {
    startedAt: '2026-08-11', // day coaching began
    windowDays: 45, // "about a month and a half"
    minDecisions: 40, // need at least this many approve/reject examples
    accuracyTarget: 0.9, // predict your call 90%+ over the last 20 reels
    autoActivate: true, // engage autopilot automatically when all gates pass
  },

  // ----- Paths -----------------------------------------------------------
  paths: {
    inbox: path.join(__dirname, 'inbox'), // drop videos/images here
    jobs: path.join(__dirname, 'jobs'), // one folder per job, all artifacts
    publicDir: path.join(ROOT, 'public'), // Remotion serves clips from here
    // Inside public/, where the stitch agent stages a job's clips.
    stageDirName: 'factory', // -> public/factory/<jobId>/...
    out: path.join(ROOT, 'out'), // final rendered mp4s
  },
};

export default config;
