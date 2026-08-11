# Fulfilling AI shots (Higgsfield)

When the Idea agent calls for a brand-new shot (a beat with `source: "generate"`),
the Generate agent needs Higgsfield to make it. There are two ways to connect
that — both produce the same result: an mp4 the Edit agent stitches in.

## Verified working

A real generation was confirmed against a live Higgsfield account:

```
model: seedance_2_5   aspect_ratio: 9:16   duration: 5s   → ~32.5 credits
prompt: "Cinematic vertical shot of a sleek matte-black electric bike riding
         fast through a sunlit Florida palm-lined street, golden hour, no text"
result: a finished 720x1280 mp4 URL, downloaded to disk
```

## Mode A — Bridge (Jarvis/Claude fulfils it)  ·  default

Best when the factory is driven by Jarvis (a Claude agent that already holds the
Higgsfield MCP tools). No API key or endpoint wiring needed.

1. Turn the engine on:  `HIGGSFIELD_ENABLED=1` (keep `HIGGSFIELD_MODE=bridge`).
2. Run a job. For each AI shot, the Generate agent writes a request into the
   job's queue:  `factory/jobs/<jobId>/gen/gen-00.request.json`
3. Jarvis (or you, in a Claude session) reads that request and calls the
   Higgsfield MCP:
   - `generate_video` with the request's `model`, `prompt`, `aspect_ratio`,
     `duration`
   - `jobs_wait` until it's `completed`
   - take the `result_url`
4. Drop the result back next to the request, using the same base name:
   - either the downloaded clip → `gen/gen-00.mp4`
   - or just the URL in a text file → `gen/gen-00.url`  (the agent downloads it)
5. Re-run the job (`approve` again, or `run.mjs new` for a fresh one). The
   Generate agent imports the fulfilled clip and the reel now uses the AI shot.

> The reel is still produced on the first pass using your real footage as a
> stand-in, so nothing ever blocks. Fulfilment upgrades it on the next pass.

## Mode B — REST (standalone always-on server)

Best when the factory runs on its own box with no Claude agent attached.

1. `HIGGSFIELD_ENABLED=1  HIGGSFIELD_MODE=rest  HIGGSFIELD_API_KEY=...`
2. Confirm the request/poll/download shape in `lib/higgsfield.mjs`
   (`generateViaRest`) against your Higgsfield API, and set `HIGGSFIELD_API_BASE`
   if yours differs.
3. Run a job — generation happens inline, no drop-back step.

## Which should I use?

- Running Jarvis 24/7 as the brain → **Bridge**. It reuses the connection Jarvis
  already has; zero extra credentials.
- A headless server with no agent → **REST**, with your Higgsfield API key.
