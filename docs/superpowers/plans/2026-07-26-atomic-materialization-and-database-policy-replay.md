# Atomic Materialization And Database Policy Replay Implementation Plan

> **For agentic workers:** Execute task-by-task. Every behavior change uses one focused failing test, verifies the expected failure, implements the smallest passing change, and reruns the focused regression set before refactoring.

**Status:** Reviewed

**Goal:** Implement Repository Audit Batch B so result trees are materialized atomically and PostgreSQL independently replays policy `2026-07-19.v2` before automatic publication or host-confirmed replacement.

**Architecture:** Put versioned policy replay in service-only PostgreSQL helpers. A public service-role RPC receives only run and proposal IDs, derives the complete result tree from persisted verified quotes, and inserts it in one transaction. Automatic publication and alternative confirmation rerun the same policy projection immediately before sharing. Keep TypeScript and PostgreSQL aligned through shared fixtures and executable disposable-database tests.

**Tech Stack:** Next.js 16, TypeScript 5, Zod 4, Vitest 4, Supabase/PostgreSQL PL/pgSQL, `pg` test client.

---

## Authority And Constraints

- Approved design: `docs/superpowers/specs/2026-07-26-atomic-materialization-and-database-policy-replay-design.md`.
- Preserve policy `2026-07-19.v2` exactly: direct-first, saving tie-breaks, fast 130% bound and tie-breaks, winning-city ranking, one city, and exactly saving/fast schemes.
- Preserve participant-owned evidence lookup by `(participantId, quoteId)` because physical quote IDs may repeat across participants.
- Preserve requester-or-host private preview reads and host-token-only confirmation.
- Do not edit historical migrations. Add `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql` and update canonical `supabase/schema.sql` in lockstep.
- Do not query or apply remote Supabase migrations and do not run live supplier acceptance.
- Do not implement Batch C except where PostgreSQL typed aggregation is inseparable from database-owned materialization.
- Update `AGENTS.md` before adding the new database-test directory or changing the publication practice.
- Do not continue past Task 1 without an executable disposable local PostgreSQL database. Static SQL matching is not proof of transaction rollback, policy selection, concurrency, or role denial.
- When a step lists several regression cases, add and run them one at a time. Keep only one newly failing behavior at a time, implement the smallest passing change, rerun its focused regressions, and only then add the next case.
- Do not push. Use small English commits after each green task.

## File And Responsibility Map

### Create

- `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql` — forward-only policy helpers, atomic materialization RPC, guarded publication replacements, and legacy draft cleanup.
- `vitest.postgres.config.ts` — executable PostgreSQL-only test configuration.
- `tests/postgres/database.ts` — guarded disposable-database connection, role bootstrap, schema/migration reset, and seed helpers.
- `tests/postgres/schema-smoke.test.ts` — harness and canonical schema execution smoke.
- `tests/postgres/policy-replay.test.ts` — direct-first, saving, fast, ranking, version, ownership, date, and work-budget behavior.
- `tests/postgres/materialization.test.ts` — rollback, idempotency, aggregate derivation, and repeated quote-ID behavior.
- `tests/postgres/publication.test.ts` — automatic and alternative recheck, concurrency, and role-denial behavior.
- `tests/postgres/migration-cleanup.test.ts` — pre-Batch-B partial/invalid draft cleanup.
- `tests/fixtures/publication-policy-v2.ts` — UUID-safe policy fixtures and expected TypeScript/PostgreSQL projections.

### Modify

- `AGENTS.md` — atomic materialization rule and `tests/postgres/` structure convention.
- `package.json`, `package-lock.json` — PostgreSQL test client and dedicated test command.
- `vitest.config.ts` — keep database tests out of the default hermetic suite.
- `supabase/schema.sql` — canonical fresh-install version of every new helper/RPC/grant.
- `src/lib/recommendation/repository.ts` — ID-only materialization RPC and strict UUID result parsing.
- `src/lib/agent/run-orchestrator.ts` — stop loading quote payloads for database materialization.
- `src/lib/fallback/mvp-store.ts` — revalidate immediately before host confirmation and preserve staged atomic writes.
- `tests/recommendation-policy.test.ts` — consume shared policy fixtures where parity matters.
- `tests/recommendation-repository.test.ts` — RPC contract and no direct result-tree writes.
- `tests/run-orchestrator.test.ts` — no quote fetch during publication and failure mapping.
- `tests/fallback-publication-guard.test.ts` — confirmation-time policy replay and previous-result preservation.
- `tests/multi-agent-schema.test.ts`, `tests/recommendation-run-schema.test.ts`, `tests/supabase-public-read-boundary.test.ts` — supplementary schema/grant/lock-order regressions.
- `docs/architecture.md`, `docs/integration-guide.md`, `docs/superpowers/README.md`, `.superpowers/sdd/progress.md` — shipped contract and verification boundary.

---

### Task 1: Establish Rules And Executable PostgreSQL Tests

**Files:**
- Modify: `AGENTS.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Create: `vitest.postgres.config.ts`
- Create: `tests/postgres/database.ts`
- Create: `tests/postgres/schema-smoke.test.ts`

- [x] **Step 1: Define the rule and directory contract before practice**

Add the permanent rule beside the current publication guardrails:

```markdown
- Materialize recommendation result, scheme, and route rows only through one database transaction. The database must derive aggregates and replay the run's supported deterministic policy from persisted verified evidence before materialization and immediately before sharing; application-approved totals are assertions, not publication facts.
```

Add to Structure:

```markdown
- `tests/postgres/`: executable disposable-PostgreSQL behavior tests for migrations, transactions, policy replay, concurrency, and database roles. They run only through `npm run test:postgres` with a guarded local `TEST_DATABASE_URL`; default unit tests never access a database.
```

- [x] **Step 2: Add the isolated test command and client**

Run:

```bash
npm install --save-dev pg @types/pg
```

Add:

```json
"test:postgres": "vitest run --config vitest.postgres.config.ts"
```

`vitest.postgres.config.ts` includes only `tests/postgres/**/*.test.ts`, runs serially, and uses a generous per-test timeout. Exclude that directory from `vitest.config.ts` so `npm run test` remains hermetic.

- [x] **Step 3: Write the guarded harness smoke test**

`tests/postgres/database.ts` must refuse to reset unless all are true:

- `TEST_DATABASE_URL` is explicitly set;
- host is `localhost`, `127.0.0.1`, or `::1`;
- database name ends in `_test`; and
- database name is not `postgres`, `template0`, or `template1`.

The reset helper creates local `anon`, `authenticated`, and `service_role` NOLOGIN roles when absent, grants the test owner permission to `SET ROLE`, recreates `public`, and executes `supabase/schema.sql`. Never print the connection URL.

Create `schema-smoke.test.ts` to assert canonical schema execution and the current core tables/functions.

- [x] **Step 4: Verify the harness guard fails safely**

Run without a URL:

```bash
npm run test:postgres -- tests/postgres/schema-smoke.test.ts
```

Expected: FAIL before any database mutation with `TEST_DATABASE_URL is required`.

- [x] **Step 5: Run against a disposable local database**

Provision a fresh local PostgreSQL database whose name ends in `_test`, then run:

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/schema-smoke.test.ts
```

Expected: PASS. The current workstation has no `supabase`, `docker`, `psql`, or `pg_isready`; if no local server is provisioned, stop here and report the prerequisite instead of substituting static tests.

- [x] **Step 6: Run the default suite and commit**

```bash
npm run test
git diff --check
git add AGENTS.md package.json package-lock.json vitest.config.ts vitest.postgres.config.ts tests/postgres/database.ts tests/postgres/schema-smoke.test.ts
git commit -m "test: add disposable PostgreSQL harness"
```

Expected: the default suite remains database-free and green.

---

### Task 2: Replay Evidence Eligibility, Direct-First, And Saving In SQL

**Files:**
- Create: `tests/fixtures/publication-policy-v2.ts`
- Create: `tests/postgres/policy-replay.test.ts`
- Create: `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql`
- Modify: `tests/recommendation-policy.test.ts`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Create shared deterministic fixtures**

Use valid UUIDs for plans, runs, participants, tasks, quotes, and proposals. Fixtures must cover:

- direct quote beating a cheaper/faster transfer;
- transfers allowed only when no direct quote exists;
- saving order by fare, transfers, duration, then ASCII quote ID;
- repeated physical `quote_id` values owned by different participants;
- cross-run, cross-participant, wrong-city, wrong-mode, wrong-date, and task-mismatched rows.

Have both `tests/recommendation-policy.test.ts` and the PostgreSQL test assert the same expected `(participantId, quoteId)` selections.

- [ ] **Step 2: Write the failing PostgreSQL tests**

Seed one validating run and call versioned internal policy helpers. Assert exact eligible quote rows and saving selections; assert malformed persisted evidence rejects the entire replay rather than disappearing from consideration.

Run:

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/policy-replay.test.ts -t "direct-first|saving|evidence"
```

Expected: FAIL because Batch B policy helpers do not exist.

- [ ] **Step 3: Implement the smallest eligible-evidence and saving helpers**

In the new migration and canonical schema:

- create a non-exposed `private` schema;
- revoke schema/function access from `public`, `anon`, and `authenticated`;
- derive the participant set in ascending UUID order;
- join every quote to its run-owned route task and plan-owned participant;
- require task/quote participant, city, mode, and search date agreement;
- require accepted mode and Asia/Shanghai meeting-date arrival;
- apply direct-first per `(city, participant)`; and
- select saving with `price`, `transfer_count`, `duration_minutes`, then `quote_id COLLATE "C"`.

Do not read proposal JSON in these fact helpers.

- [ ] **Step 4: Run focused SQL and TypeScript parity tests**

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/policy-replay.test.ts -t "direct-first|saving|evidence"
npm run test -- tests/recommendation-policy.test.ts
```

Expected: PASS with identical selections.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql supabase/schema.sql tests/fixtures/publication-policy-v2.ts tests/postgres/policy-replay.test.ts tests/recommendation-policy.test.ts
git commit -m "feat: replay saving policy in PostgreSQL"
```

---

### Task 3: Replay Fast Selection With Bounded Work

**Files:**
- Modify: `tests/fixtures/publication-policy-v2.ts`
- Modify: `tests/postgres/policy-replay.test.ts`
- Modify: `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Write one failing test per fast rule**

Add focused cases for:

- exact 130% accepted and one yuan above rejected;
- total duration;
- latest arrival as a `timestamptz` instant using different UTC offsets;
- team transfers;
- total fare;
- participant-ordered quote-ID tuple using C collation;
- direct-first applied before combination search;
- no full combination under the cap; and
- 50,000-state and 200,000-transition overflow.

Run:

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/policy-replay.test.ts -t "fast"
```

Expected: FAIL because SQL replay has no canonical fast projection.

- [ ] **Step 2: Implement bounded fast dynamic programming**

Mirror `buildFastScheme` exactly:

- process participants in ascending UUID order;
- retain one best state per total fare after each participant;
- compare same-fare states by duration, latest arrival, transfers, then quote tuple;
- compare final states by duration, latest arrival, transfers, fare, then quote tuple;
- keep only `total_fare * 10 <= saving_total * 13`;
- reject after 50,000 retained states or 200,000 examined transitions; and
- return no partial selection when coverage or budget fails.

Use integer arithmetic and PostgreSQL timestamps. Do not generate unbounded Cartesian combinations first and filter afterward.

- [ ] **Step 3: Run focused and policy regression tests**

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/policy-replay.test.ts -t "fast"
npm run test -- tests/recommendation-policy.test.ts tests/recommendation-validators.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql supabase/schema.sql tests/fixtures/publication-policy-v2.ts tests/postgres/policy-replay.test.ts
git commit -m "feat: replay bounded fast policy in PostgreSQL"
```

---

### Task 4: Replay Winning-City Ranking And Proposal Assertions

**Files:**
- Modify: `tests/fixtures/publication-policy-v2.ts`
- Modify: `tests/postgres/policy-replay.test.ts`
- Modify: `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Write failing ranking and version tests**

Add one case for each ranking key: saving total, descending direct participant count, saving-fare fairness gap, saving total duration, then city code. Also assert:

- automatic proposal city must equal the first ranked city;
- `eligibleCityCodes` is the exact unique sorted set;
- `orderedCityCodes` is the exact ranked sequence;
- an alternative proposal may use its exact `requested_city_code` even when another city wins automatically;
- an alternative cannot use any other city; and
- unknown policy versions reject closed.

Run:

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/policy-replay.test.ts -t "ranking|proposal|version"
```

Expected: FAIL because no combined version dispatcher or proposal assertion exists.

- [ ] **Step 2: Implement one canonical projection and assertion boundary**

Add internal service-only helpers that:

1. dispatch strictly on `recommendation_runs.policy_version`;
2. return ranked city projections with selected verified-quote row IDs and physical quote IDs;
3. compare automatic proposal city/evidence/schemes to the first projection;
4. compare alternative proposal city/schemes to the requested-city projection; and
5. return the canonical selected projection for downstream materialization.

Proposal totals and selections must equal replay but must never drive replay.

- [ ] **Step 3: Run all policy parity tests**

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/policy-replay.test.ts
npm run test -- tests/recommendation-policy.test.ts tests/recommendation-validators.test.ts tests/calculation-agent.test.ts tests/supervisor-agent.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql supabase/schema.sql tests/fixtures/publication-policy-v2.ts tests/postgres/policy-replay.test.ts
git commit -m "feat: replay recommendation ranking in PostgreSQL"
```

---

### Task 5: Materialize The Complete Result Tree Atomically

**Files:**
- Create: `tests/postgres/materialization.test.ts`
- Modify: `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql`
- Modify: `supabase/schema.sql`
- Modify: `tests/multi-agent-schema.test.ts`

- [ ] **Step 1: Write failing atomicity tests**

Assert `public.materialize_recommendation_result(run_id, proposal_id)`:

- accepts only an exact approved proposal on a `validating` run;
- returns one UUID;
- derives both schemes and all route rows from canonical verified quote row IDs;
- derives totals, maximum arrival, and transfers from typed quote columns;
- keeps repeated physical quote IDs participant-owned;
- creates no row when policy replay rejects;
- rolls back result, scheme, and route inserts when a test-only trigger raises during scheme or route insertion; and
- returns the same UUID without duplicates on retry after a complete commit.

Run:

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/materialization.test.ts
```

Expected: FAIL because the RPC does not exist and direct application inserts are still required.

- [ ] **Step 2: Implement the ID-only RPC**

The service-role RPC must:

1. lock plan, run, and proposal in the established order;
2. require `validating`, exact policy version, approved status, matching Supervisor version, and `validation_decision.ok`;
3. call the canonical proposal assertion;
4. revalidate and return an already-complete exact unshared tree;
5. reject, never accept, an existing incomplete or mismatched tree;
6. generate result and scheme UUIDs inside PostgreSQL;
7. insert result, both schemes, and every route in the same function transaction; and
8. return the result UUID.

Add explicit revoke from `public`, `anon`, and `authenticated`, with execute granted only to `service_role`. Add supplementary static assertions to `tests/multi-agent-schema.test.ts`; do not replace executable tests with them.

- [ ] **Step 3: Run focused tests**

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/materialization.test.ts
npm run test -- tests/multi-agent-schema.test.ts tests/recommendation-run-schema.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql supabase/schema.sql tests/postgres/materialization.test.ts tests/multi-agent-schema.test.ts
git commit -m "feat: materialize recommendation results atomically"
```

---

### Task 6: Recheck Policy At Automatic Publication

**Files:**
- Create: `tests/postgres/publication.test.ts`
- Modify: `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql`
- Modify: `supabase/schema.sql`
- Modify: `tests/recommendation-run-schema.test.ts`

- [ ] **Step 1: Write failing automatic-publication tests**

Materialize a valid automatic result, then add or mutate persisted evidence so the materialized saving/fast/winner no longer matches replay. Assert publication rejects and leaves:

- `is_shared = false`;
- the run non-completed; and
- no current shared result.

Use two database clients to publish concurrently and assert at most one call completes and exactly one current shared result exists.

Run:

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/publication.test.ts -t "automatic"
```

Expected: FAIL because the current publication RPC checks sums and proposal IDs but does not replay policy.

- [ ] **Step 2: Replace the automatic guard**

Keep the current plan/run/proposal locks and shared-result uniqueness rule. Immediately before sharing:

- call canonical proposal replay again;
- compare the persisted result tree to canonical verified quote row IDs and derived aggregates;
- reject any extra/missing scheme or participant route; and
- update result sharing and run completion only after every check passes.

- [ ] **Step 3: Run focused policy/publication tests**

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/publication.test.ts -t "automatic"
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/policy-replay.test.ts tests/postgres/materialization.test.ts
npm run test -- tests/recommendation-run-schema.test.ts tests/multi-agent-schema.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql supabase/schema.sql tests/postgres/publication.test.ts tests/recommendation-run-schema.test.ts
git commit -m "fix: replay policy before automatic publication"
```

---

### Task 7: Recheck Requested-City Policy At Host Confirmation

**Files:**
- Modify: `tests/postgres/publication.test.ts`
- Modify: `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql`
- Modify: `supabase/schema.sql`
- Modify: `tests/recommendation-run-schema.test.ts`

- [ ] **Step 1: Write failing alternative tests**

Assert:

- a policy-correct requested city can materialize even when it is not the automatic winner;
- another city cannot materialize for that preview;
- after materialization, changed evidence causing a new requested-city saving/fast selection makes confirmation reject;
- rejection leaves the previous shared result current and the preview private;
- missing/invalid host hash and expired preview still reject before sharing; and
- two concurrent confirmations cannot supersede different current rows or leave two current shared results.

Run:

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/publication.test.ts -t "alternative|host"
```

Expected: FAIL at confirmation-time policy invalidation.

- [ ] **Step 2: Replace the confirmation guard**

Retain host credential, expiry, run/proposal/result identity, and current-result locking. Call requested-city policy replay and exact materialized-tree comparison immediately before superseding. Supersede old result, share new result, and complete the run in the existing transaction only after replay passes.

- [ ] **Step 3: Run focused tests**

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/publication.test.ts
npm run test -- tests/host-confirmation.test.ts tests/host-confirmation-route.test.ts tests/recommendation-run-schema.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql supabase/schema.sql tests/postgres/publication.test.ts tests/recommendation-run-schema.test.ts
git commit -m "fix: replay policy before alternative confirmation"
```

---

### Task 8: Move The Application To The Atomic RPC

**Files:**
- Modify: `tests/recommendation-repository.test.ts`
- Modify: `tests/run-orchestrator.test.ts`
- Modify: `src/lib/recommendation/repository.ts`
- Modify: `src/lib/agent/run-orchestrator.ts`

- [ ] **Step 1: Write failing repository contract tests**

Replace the current three-insert expectations with assertions that materialization:

- calls `materialize_recommendation_result` exactly once with `p_run_id` and `p_proposal_id`;
- passes no quote payload, aggregate, result ID, scheme ID, or route row;
- parses the returned UUID strictly; and
- performs no direct `.insert` into result, scheme, or route tables.

Add an orchestrator assertion that the validating publish step loads the approved proposal but does not call `listVerifiedQuotes` for materialization.

Run:

```bash
npm run test -- tests/recommendation-repository.test.ts tests/run-orchestrator.test.ts
```

Expected: FAIL because the repository still performs three inserts and the orchestrator still loads quotes.

- [ ] **Step 2: Implement the smallest ID-only application boundary**

Change the interface to:

```ts
materializeApprovedProposal(runId: string, proposalId: string): Promise<string>;
```

Call the RPC, reject any non-UUID result, and keep `publishSharedResult` separate. In `RunOrchestrator.publish`, load only the approved proposal, call materialization with IDs, then transition alternative runs or call automatic publication as today.

Keep the public error mapping `PUBLICATION_GUARD_REJECTED`; log only existing safe run/trace context.

- [ ] **Step 3: Run focused application tests**

```bash
npm run test -- tests/recommendation-repository.test.ts tests/run-orchestrator.test.ts tests/calculate-run.test.ts tests/alternative-city-flow.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/recommendation/repository.ts src/lib/agent/run-orchestrator.ts tests/recommendation-repository.test.ts tests/run-orchestrator.test.ts
git commit -m "refactor: use atomic result materialization RPC"
```

---

### Task 9: Preserve Fallback Publication Parity

**Files:**
- Modify: `tests/fallback-publication-guard.test.ts`
- Modify: `src/lib/fallback/mvp-store.ts`

- [ ] **Step 1: Write the failing confirmation-time regression**

Create and materialize a valid alternative preview, then seed a newly better requested-city quote before confirmation. Assert confirmation rejects with `PUBLICATION_GUARD_REJECTED`, the previous city remains the current shared result, and the preview remains unshared.

Also assert invalid automatic materialization leaves result, scheme, and route collections unchanged through public read behavior.

Run:

```bash
npm run test -- tests/fallback-publication-guard.test.ts
```

Expected: FAIL because `confirmFallbackAlternative` currently shares the staged preview without replaying current policy.

- [ ] **Step 2: Revalidate immediately before every fallback sharing boundary**

Reuse `validateRecommendationPolicy(validationInput(...))`; do not add a second fallback policy implementation. Keep result/scheme/route objects staged until all validation and row derivation succeeds. Before host superseding, verify exact current proposal policy and only then mutate `supersededAt`, `isShared`, run status, and events.

- [ ] **Step 3: Run fallback and policy regressions**

```bash
npm run test -- tests/fallback-publication-guard.test.ts tests/fallback-mvp-flow.test.ts tests/recommendation-policy.test.ts tests/recommendation-validators.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fallback/mvp-store.ts tests/fallback-publication-guard.test.ts
git commit -m "fix: revalidate fallback results before sharing"
```

---

### Task 10: Clean Legacy Partial Or Policy-Invalid Drafts

**Files:**
- Create: `tests/postgres/migration-cleanup.test.ts`
- Modify: `tests/postgres/database.ts`
- Modify: `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql`
- Modify: `tests/multi-agent-schema.test.ts`
- Modify: `tests/supabase-public-read-boundary.test.ts`

- [ ] **Step 1: Write the failing forward-migration test**

Have the harness apply historical migrations only through `202607210001`, then seed:

- result-only draft;
- one-scheme draft;
- complete but policy-invalid unshared draft;
- complete policy-valid unshared draft;
- completed shared history; and
- superseded shared history.

Apply `202607260001` and assert:

- incomplete/invalid unshared trees are deleted;
- only their nonterminal owning runs become `failed / PUBLICATION_GUARD_REJECTED` with leases/deadlines cleared;
- complete valid unshared drafts remain;
- shared and superseded history is byte-for-byte unchanged; and
- every new helper/RPC is denied to `anon` and `authenticated` while the outer three RPCs required by server code execute as `service_role`.

Run:

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/migration-cleanup.test.ts
```

Expected: FAIL because the new migration has no cleanup block yet.

- [ ] **Step 2: Add migration cleanup after policy helpers exist**

Lock each candidate unshared run/result, classify with the same canonical replay, preserve valid trees, and delete invalid trees through cascades. Update only nonterminal owning runs. Never rerank, rewrite, or republish shared history.

Keep cleanup and function replacement in the same migration transaction so a failed audit rolls back the deployment.

- [ ] **Step 3: Add supplementary static privilege checks**

Update static tests to assert:

- `private` schema denial;
- public materialization RPC revoke/grant;
- internal helper revoke;
- publication/confirmation revoke/grant; and
- canonical schema and forward migration both contain the final service-only boundary.

- [ ] **Step 4: Run migration, role, and schema tests**

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres -- tests/postgres/migration-cleanup.test.ts tests/postgres/schema-smoke.test.ts
npm run test -- tests/multi-agent-schema.test.ts tests/recommendation-run-schema.test.ts tests/supabase-public-read-boundary.test.ts tests/migration-chain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql tests/postgres/database.ts tests/postgres/migration-cleanup.test.ts tests/multi-agent-schema.test.ts tests/supabase-public-read-boundary.test.ts
git commit -m "fix: clean invalid recommendation drafts"
```

---

### Task 11: Full Verification And Documentation Handoff

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/integration-guide.md`
- Modify: `docs/superpowers/README.md`
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: Run every focused PostgreSQL test together**

```bash
TEST_DATABASE_URL='<local disposable URL>' npm run test:postgres
```

Expected: PASS with real transaction rollback, policy parity, concurrency, migration cleanup, and role denial. Record PostgreSQL version and test counts without recording the URL.

- [ ] **Step 2: Run root gates**

```bash
npm run lint
npm run test
npm run build
```

Expected: PASS. Gateway gates are not required unless gateway files changed; if they did, run gateway lint, test, and build too.

- [ ] **Step 3: Update current documentation**

Document:

- database-owned atomic result-tree materialization;
- versioned SQL policy replay and its bounded-work failure mode;
- automatic and alternative final-boundary rechecks;
- fallback parity;
- disposable PostgreSQL command and safety guard; and
- migration cleanup behavior.

Mark Batch B locally implemented only after every required gate passes. State explicitly that remote migration state was not queried/applied and live supplier publication was not rerun.

- [ ] **Step 4: Review the complete diff and secrets**

```bash
git status --short
git diff --check
git diff --stat
git diff -- . ':!package-lock.json'
git diff --cached --check
```

Search staged changes for URLs containing credentials, database passwords, Supabase keys, FlyAI keys, host tokens, and participant tokens. Do not stage any `.env*`, local PostgreSQL URL, database output, coverage, or Supabase `.temp` artifact.

- [ ] **Step 5: Commit documentation and completion record**

```bash
git add docs/architecture.md docs/integration-guide.md docs/superpowers/README.md .superpowers/sdd/progress.md
git commit -m "docs: record Batch B publication integrity"
```

- [ ] **Step 6: Final handoff**

Report:

- exact focused and full gate results;
- PostgreSQL version and executable suite result;
- migration filename and local-only status;
- whether gateway remained untouched;
- commits created; and
- remaining Batch C backlog.

Do not claim remote Supabase application, credential rotation, or live supplier acceptance.
