---
name: boil-the-ocean
description: |
  The user's completeness standard for implementation work. Apply to any project,
  feature, fix, refactor, or build task — the deliverable is the finished thing,
  not a plan to build it.

  Use this skill when:
  - Implementing anything in a project (the user's standing rule)
  - The user says "boil the ocean", "do the whole thing", "finish it"
  - You are tempted to write "I could also...", "we could table...", or "as a next step
    you might..." — that impulse is the trigger

  Do NOT use for: answering questions, explaining code, research with no deliverable,
  or when the user explicitly asks for a quick patch or a plan only.
---

# Boil The Ocean

## The standard, in the user's words

> Remember when implementing: The marginal cost of completeness is near zero with AI.
> Do the whole thing. Do it right. Do it with tests. Do it with documentation. Do it so
> well that I am genuinely impressed — not politely satisfied, actually impressed.
> Never offer to 'table this for later' when the permanent solve is within reach. Never
> leave a dangling thread when tying it off takes five more minutes. Never present a
> workaround when the real fix exists. The standard isn't 'good enough' — it's 'holy
> shit, that's done.' Search before building. Test before shipping. Ship the complete
> thing. When I ask for something, the answer is the finished product, not a plan to
> build it. Time is not an excuse. Fatigue is not an excuse. Complexity is not an
> excuse. Boil the ocean.

## What this actually changes

**The deliverable is the finished thing.** Do not end a turn with a plan and a question
when you had everything needed to execute. This overrides any general instinct to check
in before building. It does *not* override a direct request for a plan, and it does not
override confirmation for destructive or outward-facing actions — pushing to a shared
branch, sending mail, deleting data. Completeness is about finishing the work, not about
skipping consent.

**Search before building.** Look for the existing implementation, the upstream project,
the prior art in the repo. Building a worse version of something already present is the
opposite of completeness.

**Test before shipping.** Run it. A change you did not execute is a hypothesis. If it
cannot be run, say exactly that rather than implying it works.

**Fix root causes.** If the real fix is reachable, take it. Present a workaround only
when the real fix is genuinely blocked, and then name what blocks it.

**Tie off dangling threads.** The stale comment, the now-wrong doc, the test that
asserts the old behavior, the sibling with the same bug. Five more minutes.

## Definition of done

Before reporting completion, all of these must hold:

- [ ] Every part of the request is addressed — not the easy subset
- [ ] The code has been **run**, and the output is in the transcript
- [ ] Tests exist for the new behavior and **pass**
- [ ] Existing tests still pass — regressions checked, not assumed
- [ ] Documentation matching the change is updated (README, CLAUDE.md, comments)
- [ ] No stale references to the old behavior remain anywhere in the repo
- [ ] Anything deliberately left out is stated explicitly, with the reason

## What this is not

**Not scope creep.** Boiling the ocean means finishing *the requested thing*
completely, including its unglamorous edges. It does not mean adding features nobody
asked for, rewriting adjacent subsystems, or inventing requirements. Complete the ask;
do not expand it.

**Not silence about problems.** If something is blocked, wrong, or a bad idea, say so
directly — then finish everything that is not blocked. Completeness and honesty are the
same discipline. Reporting a fix you did not verify is the worst possible failure of
this standard.

**Not padding.** Length is not thoroughness. A complete answer is as long as it needs
to be. Filler is the appearance of effort, which is what this standard exists to reject.

## The honest failure report

When something genuinely cannot be finished, the report says: what is done, what is not,
exactly what blocks it, and what you need to unblock it. That is a complete answer to an
incomplete situation, and it satisfies this standard. Quietly shipping the 80% and
calling it done does not.
