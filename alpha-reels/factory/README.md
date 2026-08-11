# 🏭 Reel Factory

Drop in **one video or image** → get a **ready-to-post 9:16 reel** back.

A little team of agents does the work: one pulls the clip apart, one dreams up
the concept, one makes any new AI shots, one plans the edit, one renders it, one
checks it. You approve the concept once in the middle; everything else is
automatic.

```
   your clip
      │
   ┌──▼───────┐   ┌────────┐   ┌──────────┐   ┌────────┐   ┌─────────┐   ┌────┐
   │ DISSECT  │──▶│  IDEA  │──▶│ GENERATE │──▶│  EDIT  │──▶│ STITCH  │──▶│ QC │──▶ reel.mp4
   │ see it   │   │ concept│   │ AI shots │   │ plan   │   │ render  │   │    │
   └──────────┘   └───┬────┘   └──────────┘   └────────┘   └─────────┘   └────┘
                      │
                 ⏸  YOU APPROVE
                    the concept
```

## Quick start

```bash
cd alpha-reels
npm install

# 1) start a job — runs up to the concept, then pauses for your OK
node factory/run.mjs new path/to/your-clip.mp4

# 2) read the concept it proposed
node factory/run.mjs status <jobId>      # (jobId is printed in step 1)

# 3) approve → it finishes the reel on its own
node factory/run.mjs approve <jobId>

# your reel lands in:  out/<jobId>.mp4
```

### Prefer a dashboard? (recommended)

```bash
node factory/server.mjs      # then open http://localhost:4310
```

A browser panel in the Alpha Volt look: drag a clip in, watch the six agents
light up as they work, read the proposed concept, hit **Approve & finish**, and
play/download the reel — all without the terminal.

### Prefer drag-and-drop into a folder?

```bash
node factory/run.mjs watch   # watches factory/inbox/
```

## Turning on the smart + AI parts

The factory runs fully **offline** out of the box (template copy + your real
footage). Add power by setting environment variables (put them in a `.env` or
your shell):

| Variable | What it turns on |
|---|---|
| `ANTHROPIC_API_KEY` | The **Idea** + **Edit** agents use Claude for real creative direction and smart in-points (instead of the built-in template). |
| `HIGGSFIELD_ENABLED=1` | The **Generation** agent makes brand-new AI b-roll (verified working: `seedance_2_5`, 9:16, ~32.5 credits / 5s). Two ways to connect it — via Jarvis's MCP or a REST key. See **`FULFILL.md`**. |

Nothing to install for rendering — Remotion brings its own ffmpeg.

## The agents (and where to tweak them)

| Agent | File | Job |
|---|---|---|
| Dissect | `agents/dissect.mjs` | Probe the clip, sample keyframes so others can "see" it. |
| Idea | `agents/idea.mjs` | Creative director: hook, subtitle, caption, hashtags, shotlist. |
| Generate | `agents/generate.mjs` | Make any AI shots the idea calls for (or log the request). |
| Edit | `agents/edit.mjs` | Turn the idea into a concrete EDL (segments, in-points, captions). |
| Stitch | `agents/stitch.mjs` | Render the final MP4 via the `FactoryReel` Remotion composition. |
| QC | `agents/qc.mjs` | Sanity-check the file + score it for virality. |
| Orchestrator | `orchestrator.mjs` | Runs them in order, handles your approval, resumes on demand. |

## Change the brand / voice / length

Everything lives in **`config.mjs`** — brand name, voice, accent color,
hashtags, reel length, which engines are on, and how many approval stops
(`'one'`, `'two'`, or `'none'`).

## How the approval works

With `approvals: 'one'` (the default), a new job runs to the concept and writes
a `PROPOSAL.md` into its job folder, then stops. Approve it (`approve <jobId>`)
and it resumes exactly where it left off through render + QC. Reject it
(`reject <jobId>`) to kill it. Jobs are resumable — nothing is lost if you close
the terminal.

## Where things live

```
factory/
  inbox/          drop videos/images here (watch mode)
  jobs/<jobId>/   everything about one job: source, dissection.json,
                  idea.json, PROPOSAL.md, edl.json, qc.json, state.json
out/<jobId>.mp4   the finished reels
```
