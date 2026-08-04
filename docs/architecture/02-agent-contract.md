# 02 — The Agent Contract

Three contracts hold the system together. Everything else is replaceable.

1. **`AgentManifest`** — what a capability declares about itself.
2. **`TaskEnvelope`** — what a capability receives.
3. **`TaskResult`** — what a capability returns.

Because callers depend only on these, any capability can be swapped for a different prompt, model, vendor, or a human, without touching a caller.

---

## 1. AgentManifest

Rule 3 requires ten fields on every specialist. Those ten are **required keys in the JSON Schema** ([`agency/schemas/agent-manifest.schema.json`](../../agency/schemas/agent-manifest.schema.json)); a manifest missing any of them fails validation, which fails CI, which fails the build. The rule is enforced by the machine, not by review.

### Complete example — an agent

```yaml
# agency/agents/writing/hook-writer/agent.yaml
id: writing.hook-writer
version: 3.0.0
kind: agent
layer: writing
owner: content-team

# — Rule 3, field 1 —
purpose: >
  Produce scroll-stopping opening lines for short-form real estate video.
  This capability writes hooks. It does not write scripts, choose topics,
  or decide which platform a hook is for.

# — Rule 3, field 2 —
responsibilities:
  - Generate ranked hook candidates for a single content brief
  - Vary hook archetype across candidates (question, contrarian, stat, story-open)
  - Respect the client's brand voice and forbidden-word list
nonResponsibilities:            # explicit anti-scope; lint-checked against other manifests
  - Selecting which hook to use  # → analytics.optimization
  - Writing the body script      # → writing.script-writer

# — Rule 3, fields 3 & 4 —
inputs:  { $ref: ./io/input.schema.json }
outputs: { $ref: ./io/output.schema.json }

# — Rule 3, field 5 —
memory:
  read:  [brand.tone, brand.guidelines, content.winning_hooks, content.rejected_ideas]
  write: []                     # writers do not write memory; analytics does

# — Rule 3, field 6 —
tools: []                       # empty = pure reasoning, no side effects

# — Rule 3, field 7 —
prompt: ./prompt/v3.md

# — Rule 3, field 8 —
failureConditions:
  - id: insufficient_candidates
    when: output.hooks.length < 10
    action: retry                # bounded by constraints.maxRetries
  - id: schema_violation
    when: output fails outputs schema
    action: fail                 # non-retryable — a retry cannot fix a contract break
  - id: repeats_rejected_idea
    when: any hook semantically matches content.rejected_ideas above 0.92
    action: retry
  - id: fair_housing_risk
    when: any hook trips the fair-housing lexicon
    action: escalate
    to: qa.compliance            # never auto-publish, never silently drop

# — Rule 3, field 9 —
successConditions:
  - Exactly 10 hooks returned
  - Every hook ≤ 12 words
  - At least 4 distinct archetypes represented
  - Zero semantic overlap with content.rejected_ideas
  - Passes the brand tone constraint check

# — Rule 3, field 10 —
dependencies:
  - strategy.content            # supplies the brief this hook is written against

# Execution profile — configuration, never hardcoded
model:
  tier: fast                    # fast | balanced | deep — resolved per environment
  maxOutputTokens: 2000
  temperature: 0.9
budget:
  maxCostUsd: 0.05
  maxLatencyMs: 15000
concurrency:
  perTenant: 10
```

### Complete example — a connector

Connectors declare the same ten fields. The differences: `kind: connector`, no `prompt`, no `model`, and an `impl` pointer to a typed function.

```yaml
# agency/agents/publishing/instagram/agent.yaml
id: publishing.instagram
version: 1.0.0
kind: connector
layer: publishing

purpose: >
  Publish a prepared media payload to a client's Instagram account and
  return the resulting post id and permalink.

responsibilities:
  - Upload media, create the container, publish it
  - Surface platform errors with a stable, typed error code
nonResponsibilities:
  - Formatting the payload            # → publishing.formatter
  - Deciding when to publish          # → publishing.scheduler
  - Judging whether it should publish # → qa.final-approval

inputs:  { $ref: ./io/input.schema.json }
outputs: { $ref: ./io/output.schema.json }

memory:
  read:  []
  write: [content.published]

tools:
  - automation.api-manager             # all outbound HTTP goes through one place
credentials:
  - scope: instagram.publish           # resolved at call time from the secrets service
                                       # NEVER read into memory, prompts, or logs
prompt: null                           # connectors have no prompt
impl: ./impl.ts

failureConditions:
  - id: auth_expired
    when: platform returns 190
    action: escalate
    to: exec.operations-manager        # a human must re-authorize; retrying cannot help
  - id: rate_limited
    when: platform returns 429
    action: retry
    backoff: respect-retry-after
  - id: media_rejected
    when: platform rejects the media format
    action: fail

successConditions:
  - Platform returns a post id
  - Permalink resolves with HTTP 200
  - Publication record written to content.published

dependencies:
  - publishing.formatter
```

### Field reference

| Field | Required | Notes |
|---|---|---|
| `id` | ✓ | `^[a-z]+\.[a-z0-9-]+$`, globally unique |
| `version` | ✓ | semver; a prompt change is a minor bump, an I/O schema change is a major bump |
| `kind` | ✓ | `agent` \| `connector` \| `hybrid` |
| `layer` | ✓ | one of the 12 |
| `purpose` | ✓ | one paragraph, stating what it does *and does not* do |
| `responsibilities` | ✓ | ≥ 1 |
| `nonResponsibilities` | — | strongly encouraged; feeds the duplicate-responsibility lint |
| `inputs` / `outputs` | ✓ | JSON Schema refs. The interface. |
| `memory` | ✓ | `read` and `write` scope lists. May be empty, must be present. |
| `tools` | ✓ | capability ids of connectors this may call. May be empty, must be present. |
| `prompt` | ✓ | path, or `null` for connectors |
| `failureConditions` | ✓ | ≥ 1, each with `action: retry \| fail \| escalate` |
| `successConditions` | ✓ | ≥ 1, human-readable; the eval suite asserts against these |
| `dependencies` | ✓ | capability ids; must be acyclic |
| `model`, `budget`, `concurrency` | — | defaults from environment config when omitted |

---

## 2. TaskEnvelope

Every capability receives exactly this shape. Nothing else. In particular, a capability never receives the workflow it belongs to, the client's full history, or another capability's internals — that isolation is what makes it independently testable.

```ts
interface TaskEnvelope<TInput = unknown> {
  taskId: string;                 // uuid, unique per attempt-group
  jobId: string;                  // the workflow run this belongs to
  tenantId: string;               // agency (RLS boundary)
  clientId: string;               // the real estate client

  capabilityId: string;           // 'writing.hook-writer'
  capabilityVersion: string;      // resolved concrete version, e.g. '3.0.0'

  input: TInput;                  // validated against the manifest's input schema
  memoryContext: MemorySnapshot;  // pre-fetched, scope-limited, immutable

  constraints: {
    deadline: string;             // ISO 8601
    budgetUsd: number;            // remaining budget for this task
    maxRetries: number;
    locale: string;
  };

  trace: {
    correlationId: string;        // constant across the whole client request
    parentTaskId: string | null;
    attempt: number;              // 1-based
    spanId: string;
  };

  idempotencyKey: string;         // hash(jobId, capabilityId, canonical(input))
}
```

Two properties earn their keep:

**Memory is pre-fetched, not fetched.** The orchestrator resolves the manifest's declared scopes and hands the agent an immutable snapshot. Agents cannot issue arbitrary memory queries, so scope enforcement is structural rather than advisory, and a task is reproducible from its envelope alone.

**`idempotencyKey` is derived, not random.** Same job, same capability, same input ⇒ same key. Retries, queue redeliveries, and replays cannot double-publish or double-charge.

---

## 3. TaskResult

```ts
interface TaskResult<TOutput = unknown> {
  taskId: string;
  status: 'ok' | 'retryable' | 'failed' | 'needs_human';

  output: TOutput | null;         // validated against the manifest's output schema
  artifacts: Artifact[];          // large binaries by reference, never inline

  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    costUsd: number;
    latencyMs: number;
    model: string;
  };

  evaluation: {                   // which successConditions held
    conditionsMet: string[];
    conditionsFailed: string[];
    confidence: number | null;
  };

  warnings: Warning[];
  error: TaskError | null;
  memoryWrites: MemoryWrite[];    // proposed, applied by the memory service after validation
}

interface Artifact {
  id: string;
  kind: 'image' | 'video' | 'audio' | 'document' | 'json';
  storageKey: string;             // object storage reference
  mimeType: string;
  bytes: number;
  checksum: string;
}
```

Media never travels inside a task payload — only `storageKey` references do. A 200 MB video in a queue message would take down the queue.

---

## 4. Error taxonomy

Retry behavior is derived from the error class, never guessed. This table is the single source of truth for the retry policy in [03-orchestrator.md](03-orchestrator.md).

| Class | Meaning | Retryable | Orchestrator action |
|---|---|---|---|
| `ValidationError` | Input or output failed schema | **No** | Fail the task. A retry cannot fix a contract break. |
| `ContractViolation` | Output valid but violates a `successCondition` | Yes, bounded | Retry with the failure appended to the prompt |
| `TransientProviderError` | 429, 5xx, timeout from a model or platform | Yes | Exponential backoff with jitter; respect `Retry-After` |
| `AuthError` | Credential expired or revoked | **No** | Escalate to `exec.operations-manager`; a human must re-authorize |
| `BudgetExceeded` | Task or job exceeded its cost ceiling | **No** | Halt the job, notify, await approval |
| `ComplianceBlock` | A QA gate returned a blocking verdict | **No** | Route to the repair loop, then to a human. **Never bypass.** |
| `DependencyFailed` | An upstream task failed terminally | **No** | Cancel dependents, run compensations |
| `InternalError` | A bug | Once | Retry once, then page |

---

## 5. Independent testability

Rule: every capability is testable with no other capability present.

| Kind | Test strategy |
|---|---|
| **connector** | Contract tests against a recorded-fixture HTTP layer. Fully deterministic — assert exact outputs. |
| **agent** | Golden fixtures (`fixtures/*.json`) run against a stubbed model for schema and wiring; plus periodic live evals scoring real output against `successConditions` with an LLM judge. |
| **hybrid** | Both: stub the tool, stub the model, assert independently. |

Every capability also gets, for free from the shared harness:

- **Schema round-trip** — fixture inputs validate; fixture outputs validate.
- **Manifest validity** — all ten Rule 3 fields present and well-formed.
- **Isolation** — the capability is loaded with an empty registry; if it needs a sibling at runtime, it has an undeclared dependency and the test fails.
- **Memory scope** — attempting a read outside declared scopes throws.
- **Budget** — the fixture run stays inside `budget.maxCostUsd`.

That harness is written once, in Phase 6, and applies to all 99.

---

## 6. Versioning and prompt rollout

Prompts are immutable once shipped. Improving `writing.hook-writer` means adding `prompt/v4.md` and bumping to `3.1.0`, never editing `v3.md`.

```
3.0.0 → 3.1.0    prompt or model change; I/O unchanged; auto-rollout after eval gate
3.1.0 → 4.0.0    I/O schema change; requires every dependent to be updated first
```

Rollout is staged and reversible: shadow (run alongside, compare, no traffic) → canary (10% of tenants) → full. Because the registry resolves by semver range, both versions run concurrently and rollback is a config change, not a deploy. See [06-infrastructure.md](06-infrastructure.md).
