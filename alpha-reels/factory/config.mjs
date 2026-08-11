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
  // Source of truth: ALPHA-VOLT-COMPLETE-CLAUDE-HANDBOOK.md (repo root).
  // Read it before any Alpha Volt work — it carries the evidence boundaries.
  brand: {
    name: 'Alpha Volt', // brand shorthand; full legal name below
    legalName: 'Alpha Volt & Electronics',
    business: 'Electric bikes, scooters and dirt bikes — plus phones, gaming, computers, cameras and audio',
    location: 'Kissimmee, FL — 2086 E Osceola Pkwy',
    audience:
      'local, working-class, heavily Spanish-speaking Central Florida riders and buyers; make Spanish-first / bilingual a normal choice, not decoration',
    // The identity, in a line — steers the whole look and tone.
    identity: 'Premium craft, accessible promise. Sharp, physical, aggressive, credible, modern — not a luxury boutique. Visuals may feel expensive; language stays direct, welcoming, attainable.',
    // The voice guide. Confident, direct, bilingual, easy to understand.
    voice: [
      'Direct, confident, energetic, local, easy to understand. Spanish-first or naturally bilingual for local conversion content.',
      'Premium without sounding exclusive or corporate. Aggressive for action creative but commercially clean.',
      'Specific copy beats empty slogans. Let visuals and music carry it — no filler narration.',
    ].join(' '),
    // Owner-approved offer language (access to an application/payment path —
    // NOT a guarantee of approval, payment, availability or terms). Add
    // qualification when the format allows ("Apply in store", "Terms apply").
    offers: [
      'No credit? No problem.',
      'Easy payment.',
      'From $50 down.',
      'No credit required to apply.',
      'Hablamos español.',
    ],
    // Preferred CTAs (bilingual). No unconfirmed phone number or hours, ever.
    ctas: [
      'Ven a verla en Kissimmee.',
      'Pregunta qué hay disponible hoy.',
      'Escríbenos por DM.',
      'Solicita en tienda.',
      'Ask what is on the floor today.',
    ],
    cta: 'Pregunta qué hay disponible hoy.',
    // Accent = punctuation, not wallpaper (CTAs, markers, key numbers).
    accent: '#ffc81e', // Alpha Volt yellow (per handbook §4)
    ink: '#070807', // near-black
    paper: '#f3f2ec', // off-white
    hashtags: ['#alphavolt', '#kissimmee', '#electricmoto', '#ebike', '#dirtbike', '#surron'],
    // Never write these — corporate/AI filler and unsupported hype.
    banned: [
      'the future is here', 'revolutionary', 'game changer', 'game-changer',
      'unleash', 'elevate', 'next level', 'cutting-edge', 'seamless',
    ],
  },

  // The 12 content pillars — the Idea agent picks the angle from these.
  pillars: [
    'Cinematic riding videos',
    'Bike macro and product-detail edits',
    'Model comparisons',
    'Performance and specification breakdowns',
    'Rider reactions and demonstrations',
    'Educational electric-motorcycle content',
    'Maintenance and ownership tips',
    'Behind-the-scenes content',
    'Lifestyle and motorcycle-culture content',
    'Customer bikes and community content',
    'Offers, inventory and calls to action',
    'Trend-based edits that still match the brand',
  ],

  // Accuracy guardrail — the Idea agent must obey this (handbook §6).
  accuracy: [
    'NEVER invent speed, range, power, battery capacity, charging time, price, availability, warranty, legal class or features. If a number is not confirmed from an approved product sheet, write [VERIFY] in its place. Never claim a model identity you cannot confirm.',
    'NEVER present AI-generated motorcycle imagery as real inventory. AI bikes are labeled CONCEPT content only — they cannot prove stock, condition, colorway, spec or price. When a bike is generated, disclose: "AI concept visual. Product and availability may vary — contact Alpha Volt for current inventory."',
    'DO NOT publish phone numbers, store hours, live inventory/availability, prices, or any financing-approval / guaranteed-payment / guaranteed-eligibility claim — none are owner-confirmed. Offers describe access to apply, not approval.',
    'Preserve exact motorcycle geometry before any style. A "completed" generation is not an approved one — it must pass the rubric in the handbook.',
  ].join(' '),

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
