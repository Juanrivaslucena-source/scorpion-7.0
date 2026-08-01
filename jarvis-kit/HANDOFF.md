# Jarvis Build Handoff — Claude ⇄ Codex

**Project:** Lucena Media AI Operations Command Center ("Jarvis")
**Owner:** Juan Rivas Lucena
**Bridge model:** Git repo + one-line relay. Claude specs & reviews; Codex builds.

---

## Why this file exists

Claude (cloud sandbox) and Codex (your machine) can't talk directly. This file is
the shared channel. Claude writes precise task specs here; Codex implements them
locally and pushes; Claude reviews the diff and writes the next batch. This keeps
the expensive model on planning/review and the bulk code generation on Codex.

**The relay loop (you run this):**
1. Codex reads `## Task queue` below, does the top unchecked task, commits, pushes.
2. You tell Claude: *"Codex pushed <branch/commit>, review it."*
3. Claude reviews, checks the box, writes the next task.
4. Repeat.

---

## Connecting Claude as an AI route (the actual "connect us")

Jarvis shows `2 AI PROVIDERS · 2 AI ROUTES`. Add Claude as route #3.

1. **Get a key (you, once):** console.anthropic.com → API Keys → Create Key.
2. **Store it server-side only:**
   ```
   # .env  (gitignored — never commit)
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   ⚠️ Do **not** name it `VITE_ANTHROPIC_API_KEY`. The `VITE_` prefix ships the
   value into the browser bundle where anyone can read it. The Claude call must
   run on Jarvis's server, next to your existing 2 routes.
3. **Drop in the provider:** `providers/claude.ts` (in this kit) — server-side
   Claude route with model routing, streaming, and refusal handling.
4. **Wire the stream:** `providers/route.example.ts` shows an SSE endpoint that
   feeds the "JARVIS IS RESPONDING…" bar.

Models used (current, verified):
- `claude-opus-5` — reasoning-heavy agents (Coding, Research, Content, Sales).
- `claude-haiku-4-5` — fast/cheap high-frequency agents (System Monitor).

---

## Task queue

Codex: do the **top unchecked** task only, then stop and push. One task per commit.

- [ ] **T1 — Mount the Claude route.**
  Copy `providers/claude.ts` into Jarvis's server source (e.g. `src/server/providers/`).
  Add the SSE endpoint from `route.example.ts` to the existing server.
  Add `ANTHROPIC_API_KEY` to `.env` and `.env.example` (value blank in the example).
  Acceptance: hitting the endpoint with a test message streams tokens back.

- [ ] **T2 — Register Claude in the router UI.**
  Wherever the "2 AI ROUTES" count comes from, add a third route "Claude" with
  status wired to whether `ANTHROPIC_API_KEY` is present. The header pill should
  read `3 AI ROUTES` when the key is set.
  Acceptance: dashboard shows Claude as an available route.

- [ ] **T3 — Route the Coding + Content agents through Claude.**
  Point the Coding Agent and Content Agent at `claudeStream(..., { agent: 'coding' })`
  / `{ agent: 'content' }`. Keep the other agents on their current providers.
  Acceptance: running the Coding Agent streams a Claude response into the log.

- [ ] **T4 — Persist agent runs.**
  The "73 tracked agent runs" panel needs a real store. Add a table/collection
  `agent_runs (id, agent, provider, model, status, started_at, ended_at, tokens)`.
  Write a row per run; read counts from it for the throughput panel.
  Acceptance: throughput + execution-profile panels reflect real data.

- [ ] **T5 — Memory panel backing.**
  "Jarvis response saved to Memory" implies a memory store. Add a simple
  `memories (id, agent, summary, body, created_at)` store + a save-on-complete hook.
  Acceptance: completing an agent run creates a memory entry visible in the panel.

<!-- Claude appends new tasks here as review completes. -->

---

## Review log

Claude records each review here so the thread has memory.

| Task | Commit | Verdict | Notes |
|------|--------|---------|-------|
| —    | —      | —       | (first review pending) |

---

## Conventions for Codex

- **One task per commit.** Commit message: `jarvis: T<n> <short desc>`.
- **Never commit secrets.** `.env` stays gitignored; update `.env.example` instead.
- **Server-side for anything with a key.** No `VITE_`-prefixed secrets, ever.
- **Match the existing stack.** Use Jarvis's current framework/router/state — don't
  introduce a new one. If a task needs a decision Claude didn't specify, make the
  smallest reasonable choice and note it in the commit body for review.
- **Leave the queue markers intact** so Claude can check boxes and append tasks.
