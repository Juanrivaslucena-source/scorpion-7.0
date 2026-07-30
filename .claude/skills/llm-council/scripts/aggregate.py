#!/usr/bin/env python3
"""
Aggregate LLM Council peer rankings.

A faithful port of parse_ranking_from_text() and calculate_aggregate_rankings()
from karpathy/llm-council (backend/council.py), so Stage 2 standings are computed
mechanically instead of eyeballed.

Usage:
    python3 aggregate.py rankings.json
    python3 aggregate.py --self-test

Input JSON:
{
  "label_to_model": {"Response A": "opus", "Response B": "haiku"},
  "rankings": [
    {"model": "opus",  "ranking": "...full review text ending in FINAL RANKING:..."},
    {"model": "haiku", "ranking": "..."}
  ]
}
"""

import json
import re
import sys
from collections import defaultdict

RESPONSE_PATTERN = r'Response [A-Z]'
NUMBERED_PATTERN = r'\d+\.\s*Response [A-Z]'


def parse_ranking_from_text(ranking_text):
    """Extract the ordered response labels from a reviewer's text.

    Prefers the explicit "FINAL RANKING:" section. Falls back to scanning the
    whole text so a reviewer that ignores the format still contributes.
    Returns [] when nothing parses.
    """
    if not ranking_text:
        return []

    if "FINAL RANKING:" in ranking_text:
        parts = ranking_text.split("FINAL RANKING:")
        if len(parts) >= 2:
            section = parts[1]
            numbered = re.findall(NUMBERED_PATTERN, section)
            if numbered:
                return [re.search(RESPONSE_PATTERN, m).group() for m in numbered]
            return re.findall(RESPONSE_PATTERN, section)

    return re.findall(RESPONSE_PATTERN, ranking_text)


def dedupe_preserving_order(labels):
    """Drop repeated labels, keeping first occurrence.

    A reviewer that mentions "Response A" twice in its ranking section must not
    have A counted at two positions — that would silently skew the average.
    """
    seen = set()
    out = []
    for label in labels:
        if label not in seen:
            seen.add(label)
            out.append(label)
    return out


def calculate_aggregate_rankings(rankings, label_to_model):
    """Average each model's rank position across all peer reviews.

    Lower average_rank is better. Models are identified via label_to_model, so
    an unmapped label is ignored rather than crashing.
    """
    model_positions = defaultdict(list)

    for entry in rankings:
        parsed = dedupe_preserving_order(
            parse_ranking_from_text(entry.get('ranking', ''))
        )
        for position, label in enumerate(parsed, start=1):
            if label in label_to_model:
                model_positions[label_to_model[label]].append(position)

    aggregate = []
    for model, positions in model_positions.items():
        if positions:
            aggregate.append({
                "model": model,
                "average_rank": round(sum(positions) / len(positions), 2),
                "rankings_count": len(positions),
            })

    # Sort by score, then name, so equal scores produce stable output.
    aggregate.sort(key=lambda x: (x['average_rank'], x['model']))
    return aggregate


def unparseable_reviewers(rankings):
    """Reviewers whose ranking yielded nothing — these must be reported, not hidden."""
    return [
        entry.get('model', '<unknown>')
        for entry in rankings
        if not parse_ranking_from_text(entry.get('ranking', ''))
    ]


def format_report(aggregate, dropped, total_reviewers):
    lines = ["", "COUNCIL AGGREGATE RANKINGS", "=" * 46]
    if not aggregate:
        lines.append("No parseable rankings. Aggregate standings unavailable.")
    else:
        lines.append(f"{'rank':<6}{'model':<22}{'avg':<8}{'votes'}")
        lines.append("-" * 46)
        for i, row in enumerate(aggregate, start=1):
            lines.append(
                f"{i:<6}{row['model']:<22}{row['average_rank']:<8}{row['rankings_count']}"
            )
    if dropped:
        lines.append("")
        lines.append(f"Unparseable rankings from: {', '.join(dropped)}")
        lines.append("These reviewers were excluded from the averages.")
    lines.append("")
    lines.append(
        f"{total_reviewers - len(dropped)}/{total_reviewers} reviewers counted."
    )
    if total_reviewers - len(dropped) < 2:
        lines.append(
            "WARNING: fewer than 2 usable reviewers — this is not a council result."
        )
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Self-tests
# --------------------------------------------------------------------------

def _self_test():
    failures = []

    def check(name, actual, expected):
        if actual != expected:
            failures.append(f"  {name}\n    expected: {expected}\n    actual:   {actual}")

    # Standard numbered format
    check("numbered format",
          parse_ranking_from_text("blah\n\nFINAL RANKING:\n1. Response C\n2. Response A\n3. Response B"),
          ["Response C", "Response A", "Response B"])

    # Plain format without numbers
    check("plain format",
          parse_ranking_from_text("FINAL RANKING:\nResponse B\nResponse A"),
          ["Response B", "Response A"])

    # Prose above the marker must not leak into the ranking
    check("ignores prose before marker",
          parse_ranking_from_text("Response A is weak. Response B is strong.\nFINAL RANKING:\n1. Response B\n2. Response A"),
          ["Response B", "Response A"])

    # No marker at all -> fallback scan
    check("fallback scan",
          parse_ranking_from_text("I prefer Response C then Response A"),
          ["Response C", "Response A"])

    # Nothing parseable
    check("empty", parse_ranking_from_text("I refuse to rank."), [])
    check("none input", parse_ranking_from_text(""), [])

    # Duplicate labels collapse
    check("dedupe",
          dedupe_preserving_order(["Response A", "Response B", "Response A"]),
          ["Response A", "Response B"])

    # Aggregate: A ranked 1st,1st,2nd -> 1.33 ; B ranked 2nd,2nd,1st -> 1.67
    l2m = {"Response A": "opus", "Response B": "haiku"}
    rankings = [
        {"model": "m1", "ranking": "FINAL RANKING:\n1. Response A\n2. Response B"},
        {"model": "m2", "ranking": "FINAL RANKING:\n1. Response A\n2. Response B"},
        {"model": "m3", "ranking": "FINAL RANKING:\n1. Response B\n2. Response A"},
    ]
    agg = calculate_aggregate_rankings(rankings, l2m)
    check("aggregate winner", agg[0]["model"], "opus")
    check("aggregate avg opus", agg[0]["average_rank"], 1.33)
    check("aggregate avg haiku", agg[1]["average_rank"], 1.67)
    check("aggregate vote count", agg[0]["rankings_count"], 3)

    # Unmapped labels are ignored, not fatal
    agg2 = calculate_aggregate_rankings(
        [{"model": "m1", "ranking": "FINAL RANKING:\n1. Response Z\n2. Response A"}], l2m)
    check("unmapped label ignored", [r["model"] for r in agg2], ["opus"])

    # Unparseable reviewers are surfaced
    check("unparseable detection",
          unparseable_reviewers([{"model": "m1", "ranking": "no ranking here"},
                                 {"model": "m2", "ranking": "FINAL RANKING:\n1. Response A"}]),
          ["m1"])

    # Empty council does not crash
    check("empty council", calculate_aggregate_rankings([], {}), [])

    if failures:
        print(f"FAILED ({len(failures)}):")
        print("\n".join(failures))
        return 1
    print("All self-tests passed (13 assertions).")
    return 0


def main():
    args = sys.argv[1:]
    if not args or args[0] in ('-h', '--help'):
        print(__doc__)
        return 0
    if args[0] == '--self-test':
        return _self_test()

    try:
        with open(args[0]) as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"Could not read rankings file: {e}", file=sys.stderr)
        return 1

    rankings = data.get('rankings', [])
    label_to_model = data.get('label_to_model', {})

    if not rankings:
        print("No rankings supplied.", file=sys.stderr)
        return 1
    if not label_to_model:
        print("No label_to_model mapping — cannot de-anonymize.", file=sys.stderr)
        return 1

    aggregate = calculate_aggregate_rankings(rankings, label_to_model)
    dropped = unparseable_reviewers(rankings)
    print(format_report(aggregate, dropped, len(rankings)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
