// jarvis-kit/providers/claude.ts
//
// Claude AI route for Jarvis. SERVER-SIDE ONLY.
// The ANTHROPIC_API_KEY must never reach the browser — do NOT prefix it with
// VITE_ and do NOT import this file from client code. It belongs in your Node
// server / API route, alongside whatever powers your other 2 AI routes.
//
// Install:  npm i @anthropic-ai/sdk
// Env:      ANTHROPIC_API_KEY=sk-ant-...   (in .env, gitignored)

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// ---- Model routing -------------------------------------------------------
// Route each agent to the model that fits its job. Opus for reasoning-heavy
// work (Coding, Research), Haiku for fast/cheap high-volume agent loops
// (System Monitor, quick classification). Override per-call as needed.
export type AgentKind =
  | 'coding' | 'research' | 'content' | 'sales'
  | 'automation' | 'website' | 'monitor' | 'default';

const MODEL_BY_AGENT: Record<AgentKind, string> = {
  coding:     'claude-opus-5',
  research:   'claude-opus-5',
  content:    'claude-opus-5',
  sales:      'claude-opus-5',
  automation: 'claude-opus-5',
  website:    'claude-opus-5',
  monitor:    'claude-haiku-4-5', // cheap + fast for frequent health checks
  default:    'claude-opus-5',
};

// Effort tunes cost vs. depth. Lower = fewer tokens, faster, cheaper.
type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
const EFFORT_BY_AGENT: Partial<Record<AgentKind, Effort>> = {
  coding: 'xhigh',   // best for agentic coding
  monitor: 'low',    // quick status pings
};

export interface ClaudeRunOptions {
  agent?: AgentKind;
  system?: string;
  model?: string;         // explicit override wins over agent routing
  effort?: Effort;
  maxTokens?: number;
}

type Msg = Anthropic.MessageParam;

function resolve(opts: ClaudeRunOptions) {
  const agent = opts.agent ?? 'default';
  return {
    model: opts.model ?? MODEL_BY_AGENT[agent],
    effort: opts.effort ?? EFFORT_BY_AGENT[agent] ?? 'high',
    maxTokens: opts.maxTokens ?? 16000,
    system: opts.system,
  };
}

// ---- One-shot completion (non-streaming) --------------------------------
// Good for background agent steps where you just need the final text.
export async function claudeComplete(
  messages: Msg[],
  opts: ClaudeRunOptions = {},
): Promise<string> {
  const { model, effort, maxTokens, system } = resolve(opts);
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort },
    ...(system ? { system } : {}),
    messages,
  });
  if (res.stop_reason === 'refusal') {
    throw new Error('Claude declined this request (safety refusal).');
  }
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

// ---- Streaming ----------------------------------------------------------
// Drives the "JARVIS IS RESPONDING…" bar. Yields text deltas as they arrive.
export async function* claudeStream(
  messages: Msg[],
  opts: ClaudeRunOptions = {},
): AsyncGenerator<string, void, unknown> {
  const { model, effort, maxTokens, system } = resolve(opts);
  const stream = client.messages.stream({
    model,
    max_tokens: Math.max(maxTokens, 64000), // streaming: give it room
    thinking: { type: 'adaptive' },
    output_config: { effort },
    ...(system ? { system } : {}),
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  if (final.stop_reason === 'refusal') {
    throw new Error('Claude declined this request (safety refusal).');
  }
}
