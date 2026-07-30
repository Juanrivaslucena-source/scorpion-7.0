---
name: llm-council
description: |
  Convene a multi-model deliberation before committing to an approach. Adapted from
  karpathy/llm-council: several models answer independently, peer-review each other's
  answers anonymously, and a Chairman synthesizes the final position.

  Use this skill when:
  - Starting work on any project, feature, or non-trivial change (the user's standing rule)
  - A decision is architectural, hard to reverse, or expensive to get wrong
  - Diagnosing a problem where the first plausible explanation may be wrong
  - The user says "council", "llm council", "convene the council", "get other opinions"

  Do NOT use for: trivial edits, single-file lookups, questions with one correct
  answer, or when the user explicitly asks for a fast direct answer.
---

# LLM Council

A three-stage deliberation protocol. Adapted from
[karpathy/llm-council](https://github.com/karpathy/llm-council).

The core insight worth preserving: **Stage 2 anonymizes the responses.** Reviewers
rank "Response A / B / C" without knowing which model wrote which. This is what stops
models from deferring to a brand name instead of judging the argument. If you skip the
anonymization, you are not running a council — you are running a popularity contest.

## The council in this environment

The upstream project fans out across vendors via OpenRouter (GPT, Gemini, Claude, Grok).
Claude Code cannot reach other vendors. What it *can* do is spawn subagents on genuinely
different Claude models, which differ enough in reasoning style to produce real
disagreement.

| Role | Model | Why |
|---|---|---|
| Council member | `opus` | Deepest reasoning; catches subtle architectural consequences |
| Council member | `sonnet` | Strong generalist; different failure modes from Opus |
| Council member | `haiku` | Fast and literal; excellent at catching over-engineering |
| Council member | `fable` | Different training profile; breaks correlated blind spots |
| **Chairman** | the orchestrator (you) | Holds full repo context the members lack |

**State this limitation plainly to the user the first time you convene.** A single-vendor
council has correlated blind spots — four Claude models can be confidently wrong in the
same direction in a way that GPT or Gemini would catch. It is meaningfully better than
deciding alone. It is not equivalent to the real thing.

For a genuine cross-vendor council, the user must run the upstream app (needs an
OpenRouter API key) and paste results back, or add the vendors as MCP servers.

## Protocol

### Stage 1 — First opinions

Spawn every council member **in a single message** so they run in parallel, with
`run_in_background: false`. Give each the *same* prompt. Do not tell a member what the
others said, and do not include your own hypothesis — priming defeats the purpose.

Each member needs enough context to answer without re-deriving the repo from scratch:
paste the relevant code, error output, and constraints directly into the prompt. A member
that spends its whole budget on `ls` contributes nothing.

Ask each for: their recommendation, their reasoning, the strongest objection to their own
recommendation, and what they would need to verify to be confident.

### Stage 2 — Anonymized peer review

Label the Stage 1 answers `Response A`, `Response B`, ... in a fixed order and record the
`label → model` mapping. **Keep the mapping out of the review prompt.**

Send every member this prompt verbatim (it is the upstream prompt; the rigid format
exists so the ranking can be parsed mechanically):

```
You are evaluating different responses to the following question:

Question: {user_query}

Here are the responses from different models (anonymized):

{responses_text}

Your task:
1. First, evaluate each response individually. For each response, explain what it does well and what it does poorly.
2. Then, at the very end of your response, provide a final ranking.

IMPORTANT: Your final ranking MUST be formatted EXACTLY as follows:
- Start with the line "FINAL RANKING:" (all caps, with colon)
- Then list the responses from best to worst as a numbered list
- Each line should be: number, period, space, then ONLY the response label (e.g., "1. Response A")
- Do not add any other text or explanations in the ranking section

Example of the correct format for your ENTIRE response:

Response A provides good detail on X but misses Y...
Response B is accurate but lacks depth on Z...
Response C offers the most comprehensive answer...

FINAL RANKING:
1. Response C
2. Response A
3. Response B

Now provide your evaluation and ranking:
```

Then compute the aggregate standings — do not eyeball this:

```bash
python3 .claude/skills/llm-council/scripts/aggregate.py rankings.json
```

Input format is documented in `scripts/README.md`. Lower average rank is better.

### Stage 3 — Chairman synthesis

You are the Chairman. You hold repo context the members do not, so you are synthesizing,
not tallying votes. Work from the upstream chairman framing: the individual responses and
their insights, the peer rankings and what they reveal about quality, and any patterns of
agreement or disagreement.

**The ranking is evidence, not a verdict.** A last-place answer containing one correct
critical observation beats a first-place answer that is smooth and wrong. When you
override the council, say so explicitly and give the reason.

Report to the user:
1. The council's recommendation
2. Where members **disagreed** — this is the highest-value output; unanimity often means
   the question was too easy to be worth convening for
3. Anything you overrode, and why
4. What remains genuinely uncertain

## Cost discipline

A full council is five model invocations plus synthesis. That is real money and real
latency. Do not convene for questions you can answer by reading a file. When the task is
moderate, a two-member council (`opus` + `haiku` — maximum style spread) captures most of
the benefit at half the cost.

## Failure modes

- **A member fails or times out.** Continue with the survivors, exactly as upstream does
  (`graceful degradation: returns None on failure`). Note who dropped. A two-member
  council is still a council; a one-member council is not — say so rather than pretending.
- **A member ignores the ranking format.** `aggregate.py` falls back to scanning for
  `Response X` patterns in order. If a ranking is unparseable, exclude it and say so.
- **Every member agrees immediately.** Report it as a weak signal, not a strong one. Ask
  whether the question was framed to invite agreement.
- **Members answer a different question than asked.** Your Stage 1 prompt was ambiguous.
  Fix the prompt and re-run rather than synthesizing across mismatched answers.
