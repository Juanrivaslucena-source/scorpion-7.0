// factory/agents/idea.mjs
//
// The Idea agent is the creative director. Given what the Dissect agent found
// plus the brand voice, it decides the concept for the reel: the hook (big
// on-screen text), a subtitle, the caption + hashtags for the post, and a
// shotlist — the beats the Edit agent will build from, including any brand-new
// AI shots the Generation agent should make.
//
// With an ANTHROPIC_API_KEY it uses Claude. Without one it falls back to a
// solid on-brand template so the pipeline always produces something.

import { makeLog } from '../lib/log.mjs';
import { config } from '../config.mjs';
import { askJSON, claudeAvailable } from '../lib/claude.mjs';
import { writeArtifact, note } from '../lib/jobs.mjs';

const log = makeLog('idea');

const SYSTEM = `You are the content director for ${config.brand.name}.
${config.brand.identity}
Audience: ${config.brand.audience}.
Voice: ${config.brand.voice}
Echo this kind of phrasing when it fits: ${(config.brand.preferredLines || []).join(' / ')}

STRUCTURE: hook in the first second, subject clear immediately, fast intentional
pacing, a pattern change every 1-3 seconds, readable on-screen text, a payoff,
and ONE clear call to action. Don't narrate what the visuals already say.

NEVER USE these words/phrases: ${(config.brand.banned || []).join(', ')}. No emoji
spam. No corporate language, empty motivation, or unsupported superlatives.

ACCURACY (hard rule): ${config.accuracy}

Hooks are short and punchy (<= 5 words). Captions are 1-2 tight lines + one CTA
+ 3-5 hashtags.`;

export async function idea(state) {
  const d = JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(state.artifacts.dissection, 'utf8')));
  log.step('writing the concept');

  let concept;
  if (claudeAvailable()) {
    const prompt = `Here is a source ${d.kind} for a reel:
- duration: ${d.duration || 'n/a'}s, orientation: ${d.orientation}, has audio: ${d.hasAudio}
- ${d.frameCount} sampled frames are available on disk (you can't see them, design around a typical ${config.brand.name} bike/scooter clip).

Design ONE reel, ~${config.reel.targetSeconds}s. Return JSON with exactly these keys:
{
  "title": "internal name",
  "concept": "one sentence on the angle",
  "hook": "<= 5 words, the big on-screen text",
  "subtitle": "one supporting line",
  "caption": "the post caption, 1-2 lines + CTA",
  "hashtags": ["#..."],
  "shotlist": [
    { "beat": "what happens", "seconds": 3, "source": "input" | "generate", "genPrompt": "if source=generate, an AI video prompt (9:16, on-brand)" }
  ]
}
Keep the shotlist to 3-5 beats that sum to about ${config.reel.targetSeconds}s. Prefer "input" for most beats; use "generate" only where a new shot clearly helps.`;
    try {
      concept = await askJSON(prompt, { system: SYSTEM, maxTokens: 1500 });
      log.ok('Claude wrote the concept:', concept.hook);
    } catch (e) {
      log.warn('Claude call failed, using template:', e.message);
    }
  }

  if (!concept) concept = templateIdea(d);

  // Normalise so downstream agents can trust the shape.
  concept.hashtags = (concept.hashtags?.length ? concept.hashtags : config.brand.hashtags).slice(0, 6);
  concept.shotlist = (concept.shotlist || []).map((s, i) => ({
    beat: s.beat || `beat ${i + 1}`,
    seconds: Math.max(1, Math.min(8, Number(s.seconds) || 3)),
    source: s.source === 'generate' ? 'generate' : 'input',
    genPrompt: s.genPrompt || '',
  }));

  writeArtifact(state, 'idea', 'idea.json', concept);
  note(state, `idea: "${concept.hook}" (${concept.shotlist.length} beats)`);
  return concept;
}

function templateIdea(d) {
  const b = config.brand;
  // Offline fallback — deliberately spec-free (no numbers, no model claims) so it
  // never violates the accuracy rule without a confirmed product sheet.
  return {
    title: 'Instant Torque',
    concept: 'Fast cinematic edit: the bike in motion, hard cuts on the beat, brand payoff at the end. Visual-led, no spec claims.',
    hook: 'INSTANT TORQUE.',
    subtitle: "Quiet doesn't mean slow.",
    caption: `Built for the dirt. ${b.cta}\n${b.hashtags.slice(0, 5).join(' ')}`,
    hashtags: b.hashtags,
    shotlist: [
      { beat: 'punchy opener — bike fills the frame', seconds: 3, source: 'input', genPrompt: '' },
      { beat: 'cinematic riding / motion shot', seconds: 5, source: 'input', genPrompt: '' },
      { beat: 'macro detail or wheelie moment', seconds: 4, source: 'input', genPrompt: '' },
      { beat: 'brand payoff + logo', seconds: 3, source: 'input', genPrompt: '' },
    ],
  };
}

export default idea;
