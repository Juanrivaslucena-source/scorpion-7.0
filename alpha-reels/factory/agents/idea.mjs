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

const SYSTEM = `You are the creative director for a short-form video studio.
You write scroll-stopping vertical (9:16) reels for Instagram and TikTok.
Brand: ${config.brand.name} — ${config.brand.business}.
Audience: ${config.brand.audience}.
Voice: ${config.brand.voice}
Rules: hooks are <= 5 words, ALL CAPS friendly, punchy. Never corporate.
Captions are 1-2 short lines + a call to action + 3-5 hashtags.`;

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
  return {
    title: 'Just Dropped',
    concept: 'Fast hard-cut hype reel showing the bike in motion, brand payoff at the end.',
    hook: 'NO GAS. ALL GO.',
    subtitle: 'The new ride just landed.',
    caption: `New drop just landed. ${b.cta}\n${b.hashtags.slice(0, 5).join(' ')}`,
    hashtags: b.hashtags,
    shotlist: [
      { beat: 'punchy opener on the bike', seconds: 3, source: 'input', genPrompt: '' },
      { beat: 'motion / riding shot', seconds: 5, source: 'input', genPrompt: '' },
      { beat: 'detail or wheelie moment', seconds: 4, source: 'input', genPrompt: '' },
      { beat: 'brand payoff + logo', seconds: 3, source: 'input', genPrompt: '' },
    ],
  };
}

export default idea;
