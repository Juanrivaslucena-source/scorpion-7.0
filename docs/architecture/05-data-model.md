# 05 — Data Model

Postgres 16 + pgvector. One database, row-level security as the tenant boundary, no per-tenant schemas.

**Why not schema-per-tenant?** 500 tenants × ~30 tables = 15,000 tables, and every migration becomes a 500-step deployment. RLS gives the same isolation guarantee with one migration path. Revisit only if a single client needs physical isolation for contractual reasons — at which point they get their own database, not their own schema.

---

## Tenancy

Every table carries `tenant_id`. Every table has RLS enabled. The application connects as a non-superuser role that cannot bypass it.

```sql
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON content_items
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

`app.tenant_id` is set per connection checkout from the authenticated request context. A missing setting throws rather than returning all rows — enforced by a test that asserts a query without the setting fails.

Two levels: **tenant** = the agency (RLS boundary). **client** = the real estate agent (scoping key, not a security boundary — one agency's staff may see all of its own clients).

---

## Core entities

```sql
-- ─────────── Tenancy & identity ───────────
CREATE TABLE tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  plan          text NOT NULL DEFAULT 'starter',
  status        text NOT NULL DEFAULT 'active',
  monthly_budget_usd numeric(10,2),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         citext NOT NULL,
  role          text NOT NULL,          -- owner | operator | client
  password_hash text,                   -- argon2id. The ONLY credential column
                                        -- in the database; never in any memory tier.
  UNIQUE (tenant_id, email)
);

CREATE TABLE clients (                  -- the real estate agent
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'onboarding',
  license_number text,                  -- required for compliance attribution
  brokerage      text,                  -- required for compliance attribution
  markets        jsonb NOT NULL DEFAULT '[]',
  onboarded_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

`license_number` and `brokerage` are columns, not profile blobs, because `qa.compliance` must join on them and a missing value must be a hard constraint failure rather than a missing key in JSON.

---

## Orchestration

```sql
CREATE TABLE jobs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  workflow_id    text NOT NULL,
  workflow_version text NOT NULL,
  status         text NOT NULL,   -- queued|running|partial|completed|failed|cancelled
  priority       int  NOT NULL DEFAULT 100,
  request        jsonb NOT NULL,
  result         jsonb,
  budget_usd     numeric(10,4) NOT NULL,
  cost_usd       numeric(10,4) NOT NULL DEFAULT 0,
  correlation_id uuid NOT NULL,
  deadline       timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

CREATE TABLE tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id      uuid NOT NULL,
  client_id      uuid NOT NULL,
  capability_id  text NOT NULL,
  capability_version text NOT NULL,
  stage_id       text NOT NULL,
  branch_key     text,                  -- e.g. 'reel-17' for fan-out branches
  status         text NOT NULL,
  attempt        int  NOT NULL DEFAULT 1,
  depends_on     uuid[] NOT NULL DEFAULT '{}',
  input          jsonb NOT NULL,
  output         jsonb,
  error          jsonb,
  usage          jsonb,                 -- tokens, costUsd, latencyMs, model
  evaluation     jsonb,                 -- successConditions met/failed
  idempotency_key text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz,
  UNIQUE (job_id, idempotency_key)      -- retries and redeliveries cannot duplicate work
);

CREATE INDEX ON tasks (job_id, status);
CREATE INDEX ON tasks (status, created_at) WHERE status IN ('pending','ready');
CREATE INDEX ON tasks (capability_id, created_at DESC);   -- cost/latency by capability

CREATE TABLE task_events (              -- append-only; the audit trail
  id         bigserial PRIMARY KEY,
  task_id    uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tenant_id  uuid NOT NULL,
  from_status text,
  to_status   text NOT NULL,
  detail      jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);
```

The partial index on `(status, created_at) WHERE status IN ('pending','ready')` is what keeps the scheduler's dispatch query fast when the table holds tens of millions of completed rows.

---

## Memory tiers

### Profile

```sql
CREATE TABLE client_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  scope       text NOT NULL,     -- brand.tone | brand.guidelines | offer | usp | avatar | website
  version     int  NOT NULL DEFAULT 1,
  data        jsonb NOT NULL,
  superseded_by uuid REFERENCES client_profiles(id),
  created_by_task uuid REFERENCES tasks(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ON client_profiles (client_id, scope)
  WHERE superseded_by IS NULL;         -- exactly one live version per scope
```

### Semantic

```sql
CREATE TABLE content_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  client_id    uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind         text NOT NULL,   -- hook | script | caption | carousel | email | idea
  status       text NOT NULL,   -- draft|approved|rejected|published|archived
  body         text NOT NULL,
  metadata     jsonb NOT NULL DEFAULT '{}',
  embedding    vector(1536),
  performance_score numeric(5,4),      -- engagement percentile for this client
  rejected_reason   text,
  source_task_id    uuid REFERENCES tasks(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON content_items
  USING hnsw (embedding vector_cosine_ops)
  WHERE status IN ('approved','published','rejected');
CREATE INDEX ON content_items (client_id, kind, status);
```

One table holds winning hooks, winning scripts, and rejected ideas — they differ by `status` and `kind`, not by structure. The partial HNSW index keeps the vector index small by excluding drafts, which are never retrieved.

Scoring at query time implements the retrieval formula from [04-memory.md](04-memory.md):

```sql
SELECT id, body,
       0.5 * (1 - (embedding <=> $1))
     + 0.3 * COALESCE(performance_score, 0.5)
     + 0.2 * exp(-extract(epoch from now() - created_at) / 7776000.0)  AS score
FROM content_items
WHERE client_id = $2 AND kind = $3 AND status = ANY($4)
ORDER BY score DESC LIMIT $5;
```

### Metric

```sql
CREATE TABLE metrics (
  id          bigserial,
  tenant_id   uuid NOT NULL,
  client_id   uuid NOT NULL,
  publication_id uuid REFERENCES publications(id) ON DELETE CASCADE,
  platform    text NOT NULL,
  captured_at timestamptz NOT NULL,
  impressions bigint, reach bigint, engagements bigint,
  saves bigint, shares bigint, follows bigint,
  clicks bigint, watch_through numeric(5,4),
  PRIMARY KEY (id, captured_at)
) PARTITION BY RANGE (captured_at);
```

Monthly partitions. Raw rows dropped after 13 months by detaching partitions — an instant operation, versus a `DELETE` that would bloat the table.

---

## Publishing and compliance

```sql
CREATE TABLE publications (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  client_id      uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  content_item_id uuid REFERENCES content_items(id),
  platform       text NOT NULL,
  status         text NOT NULL,   -- scheduled|publishing|published|failed|deleted
  scheduled_for  timestamptz,
  published_at   timestamptz,
  platform_post_id text,
  permalink      text,
  compliance_verdict_id uuid NOT NULL REFERENCES compliance_verdicts(id),
  idempotency_key text NOT NULL UNIQUE
);

CREATE TABLE compliance_verdicts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  client_id    uuid NOT NULL,
  content_item_id uuid NOT NULL REFERENCES content_items(id),
  verdict      text NOT NULL,     -- pass | fail | needs_review
  checks       jsonb NOT NULL,    -- fair_housing, license_attribution, disclosures, asset_rights
  reviewed_by_task uuid REFERENCES tasks(id),
  reviewed_by_user uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

`publications.compliance_verdict_id` is `NOT NULL`. **A publication row cannot physically exist without a compliance verdict attached.** The fail-closed gate from [03-orchestrator.md](03-orchestrator.md) is backed by a foreign key — even a bug in the orchestrator, or a hand-written insert, cannot publish uncleared content. This is the single most important constraint in the schema.

---

## Credentials — a separate table with a different threat model

```sql
CREATE TABLE credentials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  client_id      uuid REFERENCES clients(id) ON DELETE CASCADE,
  provider       text NOT NULL,          -- instagram | tiktok | linkedin | ...
  scope          text NOT NULL,          -- instagram.publish
  ciphertext     bytea NOT NULL,         -- envelope-encrypted; KMS-wrapped per-tenant DEK
  dek_id         text NOT NULL,
  expires_at     timestamptz,
  last_used_at   timestamptz,
  UNIQUE (client_id, provider, scope)
);
REVOKE ALL ON credentials FROM app_readonly, app_agent_runtime;
GRANT SELECT ON credentials TO app_connector_runtime;
```

Separate table, separate Postgres role, encrypted at rest with per-tenant data keys. The agent runtime role has **no grant on this table at all** — an agent cannot read a credential even if a prompt injection convinces it to try. Only the connector runtime can, and only for a declared scope.

There is exactly one other credential column in the database — `users.password_hash`, an argon2id hash of an agency staff login. No plaintext password is stored anywhere, ever, and no client platform password is stored at all (OAuth only).

---

## Migrations

Forward-only, numbered SQL files, applied in a transaction, executed by `automation.database-manager`. Every migration must be online-safe at 500 tenants:

- New columns are nullable or defaulted; backfills are separate batched jobs.
- Indexes are built `CONCURRENTLY`.
- Renames are expand/contract across two releases, never in place.
- No `ALTER TABLE ... SET NOT NULL` on a large table without a pre-validated `CHECK`.

A migration test asserts each one applies to a copy of production-shaped data within the deployment window.
