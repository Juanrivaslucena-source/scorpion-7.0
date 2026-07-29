# Scorpion 7.0 — System Architecture

Scorpion is an autonomous operations platform for running a dropshipping business with a
small human crew and a large model roster. It has three layers: a **Director layer** that
sets objectives, an **Orchestration layer** that routes work to the cheapest capable model,
and a **Console** that makes the whole thing legible.

---

## 1. Layer map

```
┌──────────────────────────────────────────────────────────────────┐
│  DIRECTOR LAYER          Claude (primary) + ChatGPT (co-director) │
│  Sets objectives, approves spend, kills losing products           │
└───────────────────────────────┬──────────────────────────────────┘
                                │ objectives, budget ceilings
┌───────────────────────────────▼──────────────────────────────────┐
│  ORCHESTRATION LAYER     scripts/orchestrate.js                   │
│  Reads the task queue, selects a model, executes, writes results  │
└───┬───────────────────┬───────────────────┬──────────────────────┘
    │                   │                   │
┌───▼──────────┐  ┌─────▼─────────┐  ┌──────▼────────┐
│ Arena.ai     │  │ Fable 5       │  │ RunwayML      │
│ 100+ models  │  │ browser agent │  │ Gen-3 video   │
│ text/vision  │  │ live web      │  │ 125 credits   │
└───┬──────────┘  └─────┬─────────┘  └──────┬────────┘
    │                   │                   │
┌───▼───────────────────▼───────────────────▼──────────────────────┐
│  MODULES    product-scout · content-studio · sales-tracker        │
└───────────────────────────────┬──────────────────────────────────┘
                                │ JSON
┌───────────────────────────────▼──────────────────────────────────┐
│  DATA        data/products.json · content.json · sales.json       │
└───────────────────────────────┬──────────────────────────────────┘
                                │ fetch()
┌───────────────────────────────▼──────────────────────────────────┐
│  CONSOLE     index.html + assets/js/*  (static, no framework)     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory contract

| Path | Responsibility |
|---|---|
| `index.html` | Dashboard shell, SVG sprite, view containers |
| `assets/css/dashboard.css` | Entire theme. No preprocessor, no build step |
| `assets/js/api.js` | Data loading, caching, formatting, service wrappers |
| `assets/js/auth.js` | GitHub OAuth flow + demo session |
| `assets/js/router.js` | Browser-side task router with cost ceilings |
| `assets/js/dashboard.js` | Every view's `skeleton()` and `render(state)` |
| `assets/js/app.js` | Boot sequence, navigation, event delegation |
| `modules/*/` | Node business logic + the JSON schema it produces |
| `scripts/orchestrate.js` | The main loop |
| `scripts/arena-router.js` | Arena.ai integration, simulated when unkeyed |
| `scripts/fable-agent.js` | Fable 5 integration, fixtures when unkeyed |
| `data/*.json` | Live state read by the console |
| `data/seed/*.json` | Demo data, copied over live files by `npm run seed` |
| `pipeline/*.md` | Architecture and director protocol |

**Rule:** modules never touch each other's data files directly. `scout.js` owns
`products.json`, `studio.js` owns `content.json`, `tracker.js` owns `sales.json`.
Cross-module reads go through the owning module's exported reader.

---

## 3. Task lifecycle

```
enqueue → queued → running → done
                          ↘ failed
```

A task is a plain object in `data/tasks.json`:

```json
{
  "id": "tsk_abc123",
  "type": "product-scout",
  "title": "Product Scout Cycle #2",
  "status": "queued",
  "assignedModel": null,
  "progress": 0,
  "payload": { "niche": "kitchen", "maxCandidates": 3 },
  "createdAt": "2026-07-29T09:12:00.000Z",
  "log": []
}
```

The orchestrator picks up anything `queued` or `running`, calls the matching handler in
`HANDLERS`, and writes the result back. Unknown task types fall through to the generic
Arena router, so adding a new capability often means adding nothing but a route.

### Registered handlers

| Task type | What it does |
|---|---|
| `product-scout` | Trend research → candidate generation → Fable sourcing → margin + saturation → writes product cards and a Markdown report |
| `content-generation` | Hooks → 3-beat scripts → clip records |
| `video-generation` | Sends a queued clip to RunwayML, debits credits |
| `sales-ingest` | Normalizes raw channel orders into the ledger |
| `sales-analysis` | Trailing-window analysis, leaderboard, projection |
| `supplier-verification` | Fable 5 re-checks live cost and seller rating |

---

## 4. Model routing

Routing lives in `modules/model-registry/models.json` and is enforced by
`registry.select()`. The order of preference is:

1. Explicit `opts.model` override
2. `taskRoutes[type].escalate` — only when `opts.escalate` is set
3. `taskRoutes[type].primary`
4. `taskRoutes[type].fallback`
5. Any model whose `capabilities` array contains the task type
6. `routingPolicy.fallbackModel`

Candidates are filtered by `isUsable()` (offline models, exhausted Fable spend, zero
Runway credits) and by the per-task cost ceiling.

### Cost discipline

- **Arena text models** — priced per 1k tokens; the router estimates 1,500 tokens/task unless told otherwise.
- **Fable 5** — flat `$0.35` per run against a `$12` cap tracked in `spendUsedUsd`. Only use it when live data genuinely cannot come from model knowledge.
- **RunwayML** — 5 credits/second against a 125-credit pool. A 15s clip is 75 credits, so the pool is roughly one hero clip plus change. Prefer real footage; reserve Gen-3 for b-roll you cannot film.

Every metered call goes through `registry.recordUsage()` so budgets stay honest across
restarts.

---

## 5. Running it

```bash
npm run seed                 # populate data/ from data/seed/
npm start                    # static server on :4173
npm test                     # 60+ smoke tests, no dependencies

npm run orchestrate:once     # drain the task queue and exit
npm run scout                # enqueue + run one product-scout cycle
node scripts/orchestrate.js --interval 30    # watch mode
```

### Environment

| Variable | Effect when set | Behaviour when unset |
|---|---|---|
| `ARENA_API_KEY` | Live model routing | Deterministic simulated responses |
| `FABLE_API_KEY` | Live browser automation | Cached fixtures from real AliExpress pages |
| `RUNWAY_API_KEY` | Live video generation | Simulated job ids, credits still debited locally |

Nothing requires a key. The entire system runs end-to-end offline, which is what makes the
test suite meaningful.

---

## 6. Authentication

The console uses the GitHub OAuth web application flow:

1. `auth.js` builds an authorize URL with a random `state` in `sessionStorage`.
2. GitHub redirects to `auth/callback.html?code=...&state=...`.
3. The callback verifies `state`, then POSTs the code to your **token exchange endpoint**.
4. That endpoint (yours, server-side) swaps the code for a token using the client secret.
5. The token and user profile are stored in `localStorage` under `scorpion.session`.

The client secret must never reach the browser, so step 4 cannot be done client-side.
Configure the endpoint URL in **Settings → GitHub OAuth**. A minimal Vercel function:

```js
export default async function handler(req, res) {
  const r = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code: req.body.code,
      redirect_uri: req.body.redirect_uri,
    }),
  });
  res.status(200).json(await r.json());
}
```

**Demo mode** bypasses all of this with a local session so the console is always usable.

---

## 7. Deployment

**GitHub Pages** — Settings → Pages → deploy from `main`, root. The console is static and
reads `data/*.json` over plain `fetch`, so it works with no server. The orchestrator runs
separately (locally or on a schedule) and commits updated JSON.

**Vercel** — import the repo, framework preset "Other", no build command, output directory
`.`. Add the token exchange function under `api/` and point Settings at it.

Either way the data files are the deployment artifact. A GitHub Action can run
`npm run orchestrate:once` on a cron and commit the diff, which gives you an autonomous
loop with no always-on server.

---

## 8. Extending the system

**New task type**

1. Add a route to `taskRoutes` in `models.json`.
2. Add a system prompt to `SYSTEM_PROMPTS` in `arena-router.js`.
3. Add a simulated branch to `simulate()` so offline runs stay honest.
4. Optionally add a handler in `orchestrate.js` — without one it falls through to Arena.

**New view**

1. Add a `<section class="view" id="view-yourview">` to `index.html`.
2. Add a nav button with `data-view="yourview"`.
3. Export `{ title, sub, skeleton(), render(state) }` from `ScorpionViews` in `dashboard.js`.

Navigation, hash routing and skeleton handling are automatic from there.
