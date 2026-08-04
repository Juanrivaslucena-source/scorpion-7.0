# 04 — Memory

Long-term memory is the difference between an agency that improves with every client and one that starts from zero every morning. It is infrastructure — used by every capability, owned by none.

**The brief listed a "Memory Manager" agent. There isn't one.** A capability that every other capability depends on is not a capability; it is a service. Making it an agent would put a model call, a queue hop, and a failure mode in front of every single read.

---

## Four tiers, one API

| Tier | Store | Answers | Written by |
|---|---|---|---|
| **Profile** | Postgres, relational | "Who is this client and what are the rules?" | intake, executive |
| **Episodic** | Postgres, append-only | "What did we do, and what happened?" | orchestrator (automatic) |
| **Semantic** | Postgres + pgvector | "What has worked before that resembles this?" | analytics, QA |
| **Metric** | Postgres, time-partitioned | "What are the numbers over time?" | `analytics.collector` |

```ts
interface MemoryService {
  resolve(scopes: Scope[], clientId: string, opts?): Promise<MemorySnapshot>;  // orchestrator only
  search(scope: Scope, query: string, clientId: string, k: number): Promise<SemanticHit[]>;
  append(write: MemoryWrite, ctx: TaskContext): Promise<void>;                 // validated, scope-checked
  metrics(query: MetricQuery): Promise<MetricSeries>;
}
```

Agents never call this directly. The orchestrator resolves declared scopes and delivers an immutable snapshot inside the `TaskEnvelope`, which is what makes scope enforcement structural rather than advisory.

---

## What each tier holds

### Profile — canonical facts

Everything the brief asked to store about *who the client is*: client record, brand guidelines, tone and voice, USP, avatars, offers, website information, content calendar. Small, hot, versioned, and read on nearly every task.

Every profile row is versioned. When `intake.brand-extraction` re-runs after a rebrand, the old guidelines are superseded, not deleted — content produced last quarter remains explicable by the rules in force at the time.

### Episodic — what happened

Every task run: capability, version, input hash, output reference, cost, latency, verdicts, retries, and every human approval, rejection, and edit. Append-only, never mutated.

This tier is simultaneously the audit log, the cost ledger, the replay source, and the compliance record. Fair Housing verdicts live here, which is what makes "prove this ad was checked" answerable.

Client feedback is episodic and structured — `approved`, `rejected(reason)`, `edited(diff)`. An edit diff is the highest-signal training data the system produces: it is the client showing, not telling, what was wrong.

### Semantic — what worked

Vector-indexed content with performance metadata attached: past content, **winning hooks**, **winning scripts**, ideas, and **rejected ideas**.

Rejected ideas are a first-class scope, not an afterthought. Without them the system re-proposes the concept a client killed three months ago, which is the single fastest way to look like it has no memory. `writing.hook-writer` declares `content.rejected_ideas` as a read scope and a `failureCondition` that trips on semantic similarity above 0.92.

Retrieval is not raw cosine similarity. It is scored:

```
score = 0.5 · cosine_similarity
      + 0.3 · normalized_performance     (engagement percentile for this client)
      + 0.2 · recency_decay              (half-life 90 days)
```

Pure similarity retrieves things that resemble the query. This retrieves things that resembled the query **and worked**, which is the actual question.

### Metric — the numbers

Per post, per platform, per day: impressions, reach, engagement, saves, shares, follows, clicks, watch-through. Time-partitioned monthly, rolled into daily aggregates after 90 days, raw rows dropped after 13 months. Feeds every analytics capability and the performance term in semantic scoring.

---

## Scoping — the mechanism that makes this scale

Each manifest declares its scopes:

```yaml
memory:
  read:  [brand.tone, brand.guidelines, content.winning_hooks, content.rejected_ideas]
  write: []
```

The orchestrator resolves exactly those, and nothing else, into the envelope.

**Why this is the load-bearing decision at 500 clients.** A client with two years of history has thousands of posts and hundreds of thousands of metric rows. Passing "the client's memory" into a prompt is impossible at that size and ruinous at any size. Scoped resolution means `writing.hook-writer` receives ~2 KB — tone rules, twelve winning hooks, the rejected list — regardless of whether the client is two weeks or two years old.

**Prompt size stays constant as account history grows.** That is the property that makes the cost model survive scale, and it comes from scoping, not from a bigger context window.

Enforcement is layered: manifest declaration → orchestrator resolution → a frozen snapshot object → row-level security on `client_id` in the database. A capability attempting an undeclared read has nothing to attempt it *with*.

---

## Writes are proposed, not performed

Agents return `memoryWrites` in their `TaskResult`; the memory service applies them after validation:

1. The capability declared that scope in `memory.write`.
2. The payload validates against the scope's schema.
3. The write is not a duplicate (content-hashed).
4. Secret-pattern scanning passes (see below).

An agent cannot corrupt shared memory through a malformed or hallucinated write, and every write is attributable to a task in the episodic tier.

**The learning loop**, concretely:

```
publish → analytics.collector (24h/7d/30d) → metric tier
  → analytics.content-reviewer  → "hook archetype 'contrarian stat' outperformed by 3.1×"
  → analytics.optimization      → writes to content.winning_hooks with performance metadata
  → next month, writing.hook-writer retrieves it, weighted by that performance
```

Nobody edits a prompt. The prompt is stable; what changes is what memory hands it. This is why prompts stay short and why quality compounds with account age.

---

## Passwords and credentials are never stored

An explicit requirement from the brief, and the architecture takes it further than the letter of it: **no credential of any kind — password, API key, OAuth token, refresh token, or session cookie — exists in any memory tier.**

They live in a separate service with a different threat model:

```
┌──────────────────┐        ┌──────────────────────────────┐
│  MEMORY SERVICE  │        │      SECRETS SERVICE         │
│  brand, content, │  ✗───► │  envelope-encrypted (KMS),   │
│  metrics, history│  never │  per-tenant data keys,       │
└──────────────────┘        │  scope-gated, access-logged  │
        ▲                   └──────────────┬───────────────┘
        │ snapshot                         │ resolved at call time only
   ┌────┴─────┐                     ┌──────┴───────┐
   │  AGENTS  │  ✗ no access ─────► │  CONNECTORS  │
   └──────────┘                     └──────────────┘
```

The rules:

- **Agents have no path to credentials.** No manifest with `kind: agent` may declare a `credentials` block; schema validation rejects it.
- **Connectors resolve at call time.** A token is fetched, used within the request, and never returned in a `TaskResult` or written anywhere.
- **Redaction is centralized and mandatory.** One serializer sits in front of every log line, trace span, prompt, and stored payload, matching known secret shapes and known-token registries. Structural, not per-call-site discipline.
- **Write-path scanning.** Any `memoryWrite` matching a secret pattern is rejected and raises a security event — a defense against a client pasting an API key into a discovery call transcript.
- **Client platform access is OAuth, never passwords.** The system stores refresh tokens in the secrets service; it never asks for or holds an Instagram password. `AuthError` is deliberately non-retryable and escalates to a human re-authorization flow.

---

## Retention and isolation

| Tier | Hot | Archive | Delete |
|---|---|---|---|
| Profile | indefinite | on churn +90d | on request (GDPR/CCPA) |
| Episodic | 13 months | cold storage 7y (compliance) | never within retention |
| Semantic | indefinite | — | on request; embeddings deleted with source |
| Metric | 13 months raw | daily aggregates 7y | — |

Every tier carries `tenant_id` and `client_id`, and every table enforces row-level security on `tenant_id`. Isolation lives in the database, not in application code — an ORM bug or a missing `WHERE` clause cannot leak one agency's brand guidelines into another's prompts.

Client deletion is a single cascade across all four tiers plus object storage plus the secrets service, executed as one transaction with a verification report.
