# Project Scorpion + OmniRoute

**Text → Image → Video pipeline.** Uses [OmniRoute](http://localhost:20128) (an
AI gateway) to route image generation and handle fallbacks, then feeds the
result to [Higgsfield](https://higgsfield.ai) for video generation.

> **Status:** OmniRoute running on `localhost:20128`.

## Quick start (~5 min)

### 1. Install dependencies

```bash
npm install
```

### 2. Add your keys

Copy the example env file and fill in your keys:

```bash
cp .env.example .env
```

```
OMNIROUTE_KEY=your-dashboard-key
HIGGSFIELD_KEY=your-higgsfield-key
```

- **OmniRoute key:** `http://localhost:20128/dashboard` → top right.
- **Higgsfield key:** from your Higgsfield account.

> `.env` is gitignored, so your real keys never get committed.

### 3. Run

```bash
node scorpion.js
```

Or pass your own idea:

```bash
node scorpion.js "Sleek EV reveal at night, neon rain, slow dolly"
```

## File structure

```
scorpion-7.0/
├── scorpion.js      # Main pipeline (text → prompt → video)
├── .env.example     # Template for your API keys
├── .gitignore
├── package.json
└── README.md        # This file
```

## Key endpoints

| Service    | URL                                  |
| ---------- | ------------------------------------ |
| OmniRoute  | `http://localhost:20128/v1`          |
| Dashboard  | `http://localhost:20128/dashboard`   |
| Higgsfield | `https://api.higgsfield.ai/v1`       |

## Environment variables

| Variable         | Required | Description                                   |
| ---------------- | -------- | --------------------------------------------- |
| `OMNIROUTE_KEY`  | yes      | From the OmniRoute dashboard (top right).     |
| `HIGGSFIELD_KEY` | optional | From your Higgsfield account. Enables video.  |
| `OMNIROUTE_URL`  | no       | Override the OmniRoute base URL.              |
| `HIGGSFIELD_URL` | no       | Override the Higgsfield base URL.             |

## Next steps

- Wire up the real Higgsfield video-generation endpoint in `generateVideo()`
  (currently a placeholder).
- Add the image-generation step between prompt and video.
- Iterate from there.
