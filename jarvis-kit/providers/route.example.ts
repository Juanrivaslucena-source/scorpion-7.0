// jarvis-kit/providers/route.example.ts
//
// Example server route that streams Claude to the Jarvis UI over SSE.
// Adapt to whatever server Jarvis already uses (Express, Fastify, a Vite
// middleware, a Next/Nitro API route). The key idea: the browser calls YOUR
// server, and YOUR server calls Claude with the secret key.

import type { Request, Response } from 'express';
import { claudeStream, type AgentKind } from './claude';

// POST /api/claude  { agent, system, messages: [{role, content}] }
export async function claudeSSE(req: Request, res: Response) {
  const { agent, system, messages } = req.body as {
    agent?: AgentKind;
    system?: string;
    messages: { role: 'user' | 'assistant'; content: string }[];
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    for await (const delta of claudeStream(messages, { agent, system })) {
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }
    res.write(`event: done\ndata: {}\n\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'stream error';
    res.write(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
  } finally {
    res.end();
  }
}

// --- Browser side (client), for reference -------------------------------
// const es = new EventSource('/api/claude?...') won't POST a body, so use fetch:
//
//   const resp = await fetch('/api/claude', {
//     method: 'POST',
//     headers: { 'content-type': 'application/json' },
//     body: JSON.stringify({ agent: 'coding', messages }),
//   });
//   const reader = resp.body!.getReader();
//   const dec = new TextDecoder();
//   for (;;) {
//     const { value, done } = await reader.read();
//     if (done) break;
//     // parse `data: {"delta":"..."}` lines and append to the responding bar
//   }
