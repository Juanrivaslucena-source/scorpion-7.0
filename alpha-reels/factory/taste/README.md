# Your learned taste (the autopilot goal)

This folder is where the factory learns what you'd post. Every approve/reject
lands in `decisions.jsonl`; `profile.md` is a readable summary; `state.json`
tracks whether autopilot has engaged.

## The goal

> Approve/reject reels for ~6 weeks. Once the Coach can predict your call
> accurately over enough reels, it flips the factory to autopilot on its own.

Three gates must all pass (set in `../config.mjs` → `goal`):

1. **Enough examples** — at least `minDecisions` reels judged (default 40).
2. **Predicts you** — ≥ `accuracyTarget` (default 90%) over your last 20 reels.
3. **Window elapsed** — at least `windowDays` (default 45) since `startedAt`.

Check progress any time: `node factory/run.mjs goal` (or the banner on the
dashboard). When all three pass, autopilot engages and reels finish without
asking. You can always turn it back off by setting `state.json` →
`"autopilot": false`.

## Persistence (important)

This learning only helps if it *sticks*. On an always-on host (your own
server), it persists on disk automatically — nothing to do. These files are
git-ignored on purpose (they're personal and machine-local); if you run the
factory in a throwaway environment, copy this folder somewhere durable so the
6 weeks of learning isn't lost.
