# aggregate.py

Computes Stage 2 standings for the LLM Council. Port of `parse_ranking_from_text()`
and `calculate_aggregate_rankings()` from
[karpathy/llm-council](https://github.com/karpathy/llm-council) `backend/council.py`.

## Why a script

Averaging rank positions by hand is exactly the kind of arithmetic that gets quietly
wrong, and a wrong tally silently corrupts the Chairman's synthesis. Run the script.

## Usage

```bash
python3 aggregate.py rankings.json   # compute standings
python3 aggregate.py --self-test     # 13 assertions, no input needed
```

## Input

```json
{
  "label_to_model": {
    "Response A": "opus",
    "Response B": "sonnet",
    "Response C": "haiku"
  },
  "rankings": [
    { "model": "opus",   "ranking": "<full review text from that reviewer>" },
    { "model": "sonnet", "ranking": "<full review text>" },
    { "model": "haiku",  "ranking": "<full review text>" }
  ]
}
```

- `label_to_model` — the de-anonymization map built in Stage 2. Required.
- `rankings[].model` — who wrote the *review* (used only to name dropped reviewers).
- `rankings[].ranking` — paste the reviewer's **entire** response. The parser locates
  the `FINAL RANKING:` section itself; pre-trimming risks cutting it off.

## Output

Lower `avg` is better — it is the mean position the model was placed in by its peers.

```
rank  model                 avg     votes
1     sonnet                1.0     2
2     haiku                 2.5     2
3     opus                  2.5     2
```

Ties sort alphabetically so repeated runs produce identical output.

## Parsing behavior

1. Prefers the numbered list under `FINAL RANKING:`.
2. Falls back to unnumbered `Response X` lines in that section.
3. Falls back to scanning the whole text if the marker is absent.
4. Yields `[]` if nothing matches — that reviewer is excluded and **named in the
   report**. Never silently dropped.

Duplicate labels within one ranking collapse to first occurrence, so a reviewer that
mentions `Response A` twice cannot skew A's average.

Unmapped labels (e.g. a hallucinated `Response Z`) are ignored rather than fatal.

The report warns when fewer than two reviewers parsed — at that point the result is
not a council outcome and should not be presented as one.
