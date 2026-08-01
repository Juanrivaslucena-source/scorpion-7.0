# Getting Jarvis running in the cloud, 24/7

Goal: Jarvis stays awake and working even when Juan's MacBook is closed or off.
Once it's on a cloud host, the laptop is no longer part of the picture at all.

There are two files in this kit that make it happen:
- `Dockerfile` — packages Jarvis so a cloud computer can run it.
- this guide — the steps.

---

## The plain version

"The cloud" = a computer somewhere that never turns off. You rent a small one,
put Jarvis on it, and it runs around the clock. Small monthly cost (usually
**$5–10**), and you can cap the spending so there are no surprises.

---

## Pick a host (any one — all beginner-friendly)

Recommended, easiest first:

1. **Railway** (railway.app) — simplest. Connect the GitHub repo, it builds and
   runs it. Good for someone who doesn't want to touch servers.
2. **Render** (render.com) — also easy; pick a "Web Service", point it at the repo.
   Note: use a *paid* instance, not the free one — the free one falls asleep, and
   we want 24/7.
3. **Fly.io** — a bit more technical, cheap, very reliable.

Any of these keeps Jarvis on all the time. Railway is the gentlest start.

---

## Steps (Codex does most of this — see the paste-line at the bottom)

1. **Make sure Jarvis is on GitHub.** The cloud host pulls the code from there.
   If it isn't pushed yet, that's step zero.
2. **Create an account** on Railway (or Render).
3. **New project → Deploy from GitHub → pick the Jarvis repo.** The host reads
   the `Dockerfile` in this kit and builds Jarvis automatically.
4. **Add the secret key.** In the host's dashboard there's a section called
   **"Environment Variables"** (or "Variables" / "Secrets"). Add:
   ```
   ANTHROPIC_API_KEY = sk-ant-...   (the key from console.anthropic.com)
   ```
   This is where the key lives in the cloud — safe, not in the code. Add any
   other keys Jarvis's other AI routes need here too.
5. **Deploy.** The host gives you a web address (like `jarvis.up.railway.app`).
   Open it — that's Jarvis, running in the cloud. Close your laptop and check it
   from your phone; it's still there.

---

## Keeping the always-on part actually always-on

Jarvis has two pieces: the screen you look at (the dashboard) and the engine
behind it (the agents doing work). For "24/7 even when the laptop's off," the
**engine** has to be the thing running on the host — not just the dashboard.

Codex: make sure the deployed service runs the server/agent process (the part
that owns the agent loop and the AI routes), and that the health checks / agent
runs happen server-side on a schedule — not triggered by a browser being open.
If agents currently only run when the dashboard is open in a tab, move that
trigger to the server so it runs on its own.

---

## Money safety

- Set a **spending limit / budget cap** in the host's billing settings.
- Set a spending limit on the Anthropic key too (console.anthropic.com → billing).
- Start with the smallest instance; scale up only if Jarvis needs it.

---

## One line to hand Codex

> Read `jarvis-kit/DEPLOY.md` and `jarvis-kit/Dockerfile`. Deploy Jarvis to a
> cloud host (Railway or Render) so it runs 24/7. Adjust the Dockerfile's build
> and start commands to match Jarvis's real scripts, make sure the always-on
> agent/engine process runs server-side (not only when the dashboard is open),
> and set it up to read ANTHROPIC_API_KEY from the host's environment variables.
> Tell me the account steps you need me to do by hand.
