// factory/lib/claude.mjs
//
// The "brains" behind the Idea and Edit agents. Wraps the Anthropic SDK and
// gives us a JSON helper that reliably returns a parsed object. If no API key
// is set, callers fall back to their built-in template logic so the pipeline
// still runs offline.

import { config } from '../config.mjs';

let client = null;
async function getClient() {
  if (client) return client;
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  client = new Anthropic({ apiKey: config.engines.claude.apiKey });
  return client;
}

export const claudeAvailable = () => config.engines.claude.enabled;

// Ask Claude and get back plain text.
export async function ask(prompt, { system, fast = false, maxTokens = 2000 } = {}) {
  const c = await getClient();
  const model = fast ? config.engines.claude.fastModel : config.engines.claude.thinkModel;
  const res = await c.messages.create({
    model,
    max_tokens: maxTokens,
    system: system || undefined,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

// Ask Claude for JSON and get back a parsed object. We prime the assistant turn
// with "{" so the model must continue a JSON object, then parse defensively.
export async function askJSON(prompt, { system, fast = false, maxTokens = 2000 } = {}) {
  const c = await getClient();
  const model = fast ? config.engines.claude.fastModel : config.engines.claude.thinkModel;
  const res = await c.messages.create({
    model,
    max_tokens: maxTokens,
    system: (system ? system + '\n\n' : '') + 'Respond with a single JSON object and nothing else.',
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '{' },
    ],
  });
  const text = '{' + res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return parseLoose(text);
}

function parseLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s !== -1 && e !== -1) {
      try {
        return JSON.parse(text.slice(s, e + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error('Claude did not return parseable JSON');
  }
}

export default { ask, askJSON, claudeAvailable };
