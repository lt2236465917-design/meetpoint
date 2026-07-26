# Atomic Materialization And Database Policy Replay Design

**Date:** 2026-07-26

**Status:** Approved

**Scope:** Repository Security And State-Machine Audit, Batch B

## Purpose

Batch B closes two independently verified publication-integrity gaps without changing the user-facing recommendation policy or private-preview authority model.

The implementation must:

1. materialize a recommendation result, its two schemes, and every participant route in one database transaction; and
2. make the database independently replay policy `2026-07-19.v2` from persisted participants, route tasks, and verified quotes before a result can become shared.

## Verified Audit Findings

### Materialization is not atomic

`SupabaseRecommendationRepository.materializeApprovedProposal` currently performs three separate Supabase inserts: `recommendation_results`, then `recommendation_schemes`, then `recommendation_scheme_routes`. A later failure leaves earlier rows committed. Its initial `recommendation_results` existence check then treats any existing row as a completed materialization, including a result left without both schemes or full route coverage.

Foreign-key cascades protect deletion integrity but do not join separate HTTP requests into one transaction. The publication RPC fails closed on incomplete evidence, but the run becomes `failed` while orphaned private draft rows remain.

### The database guard checks consistency, not policy

`publish_shared_result` and `confirm_alternative_result` currently verify approved-proposal identity, participant coverage, quote ownership, accepted modes, arrival calendar date, proposal quote IDs, fare sums, and duration sums. They do not prove that:

- each participant's selected quote comes from the direct-first eligible set;
- the saving route is the exact lowest verified fare with the approved tie-breaks;
- the fast team combination is the fastest eligible combination within 130% of the saving total; or
- an automatic result uses the first city under the approved winning-city ranking.

The RPCs therefore trust an application-approved proposal for policy facts that the database is intended to guard independently.

## Non-Goals

- Do not change policy `2026-07-19.v2`, candidate generation, accepted transport modes, or the one-city/two-scheme result IA.
- Do not let Calculation or Supervisor invent, edit, or persist supplier facts.
- Do not change requester-or-host private-preview reads or host-only alternative confirmation.
- Do not implement Batch C Amap identity validation, calendar-input hardening, terminal-preview UX, public-progress selection, or plan-code retry generation.
- Using PostgreSQL `timestamptz` aggregation for newly materialized rows is required for truthful database-derived aggregates; Batch C still owns remaining application-side instant/date validation findings.
- Do not query or apply remote migrations and do not claim live supplier publication acceptance during local implementation.

## Approved Policy Semantics To Replay

The database implementation is a second implementation of the existing TypeScript policy, not a new policy.

For a run, the canonical participant order is ascending participant UUID, matching the repository's current order. Evidence is eligible only when its persisted route task, run, participant, city, mode, and search date agree; the participant belongs to the plan; the mode is accepted by that participant; and arrival falls on the plan's Asia/Shanghai meeting date. A malformed or cross-owned persisted fact rejects replay rather than being ignored.

For each eligible city and participant:

1. If any direct quote exists, exclude all connecting quotes for that participant and city. Otherwise keep connecting quotes.
2. Saving selects the lowest `price_cny`, then lowest `transfer_count`, then lowest `duration_minutes`, then lexically smallest `quote_id`.
3. Fast considers one direct-first quote per participant and only combinations whose integer total satisfies `fast_total * 10 <= saving_total * 13`.
4. Fast minimizes total duration, then latest arrival instant, then total transfers, then total fare, then the ordered quote-ID tuple.

Eligible automatic cities are ranked by saving total, descending direct participant count, saving-fare fairness gap, saving total duration, and city code. The first city is the only publishable automatic winner. An alternative run is intentionally bound to `requested_city_code`; it replays saving and fast selection for that city but does not replace the request with the automatic winner.

Text tie-breaks use deterministic bytewise/C collation for the ASCII city and quote identifiers so database locale cannot change the result. Timestamp comparisons use PostgreSQL instants, not formatted-string order. Fare-ratio arithmetic stays integer-only.

Policy replay is explicitly versioned. Batch B supports `2026-07-19.v2`; an unknown `recommendation_runs.policy_version` fails closed. A future policy version must add matching TypeScript and SQL replay implementations and parity fixtures before it can publish.

The SQL replay must retain the TypeScript evaluator's bounded-work contract: no more than 50,000 fast-policy states and 200,000 transitions. Exceeding either budget rejects materialization/publication with a safe policy-limit diagnostic; it must not fall back to a partial or approximate winner.

## Architecture

### One internal policy projection

A service-only, versioned SQL policy helper derives canonical ranked city projections from persisted database rows. For every eligible city it returns the exact saving and fast participant-to-verified-quote selections plus database-derived aggregates.

Both materialization and final sharing call this same helper. This prevents three SQL paths—automatic materialization, automatic publication, and alternative confirmation—from acquiring slightly different policy rules. Direct execution is revoked from `public`, `anon`, and `authenticated`; only the reviewed service-role boundary may invoke it.

The proposal remains useful as an agent decision and explanation record, but its `totalFareCny`, comparison arrays, and selected quote IDs are assertions to compare against canonical replay, never source facts for database arithmetic.

### Atomic materialization RPC

Replace the repository's direct table inserts with one service-only RPC:

```ts
materialize_recommendation_result(runId: string, proposalId: string): resultId
```

The application supplies no result ID, scheme ID, aggregate, route row, or quote payload. Inside one PostgreSQL transaction, the RPC:

1. locks and validates the plan, run, and exact approved Supervisor-reviewed proposal;
2. requires the run to be `validating` and the proposal policy version to equal the run policy version;
3. replays the versioned policy from persisted evidence;
4. requires the proposal city, both ordered scheme kinds, every `(participantId, quoteId)` selection, totals, eligible-city evidence, and ordered-city evidence to equal replay;
5. derives the result, both schemes, all participant routes, fare totals, duration totals, latest arrivals, and transfer totals from selected `verified_quotes` rows; and
6. inserts the result tree and returns its result UUID.

Any error rolls back the entire tree. The repository must not perform compensating deletes.

The RPC is idempotent for an already complete, exact, unshared result belonging to the same run and proposal: it locks, revalidates, and returns the existing result UUID. It must never accept a row merely because `recommendation_results` exists.

### Automatic publication

`publish_shared_result` remains the only automatic sharing boundary. In its existing plan/run transaction and immediately before setting `is_shared`, it reruns the same policy projection and exact-result comparison. This closes the gap between materialization and sharing if persisted evidence or proposal state changes.

It additionally retains the existing requirements:

- automatic run in `validating`;
- exact approved proposal and current policy version;
- no current non-superseded shared result;
- full current-plan participant coverage;
- one saving and one fast scheme only; and
- atomic result sharing plus run completion.

The RPC derives truth from verified quotes and the policy projection. Matching application-supplied totals alone is never sufficient.

### Alternative preview and host confirmation

Alternative materialization uses the same atomic RPC while the run is `validating`. Replay requires the proposal/result city to equal `requested_city_code` and validates the exact saving/fast routes for that city. Only after successful atomic materialization may the orchestrator move the run to `awaiting_host_confirmation`.

`confirm_alternative_result` retains host-token verification, expiry handling, exact proposal binding, and the requirement for a current shared result. Immediately before superseding that result, it reruns the requested-city policy and exact-result comparison. Confirmation, superseding, sharing, and run completion remain one database transaction.

A valid alternative does not have to equal the automatic winning city; doing so would defeat the approved private what-if flow.

### Existing partial-draft migration

The hardening migration must audit pre-Batch-B unshared drafts before replacing the RPCs.

- A complete, policy-valid draft is preserved and will be revalidated again by the final sharing boundary.
- An incomplete or policy-invalid result/scheme/route tree is never repaired from application-supplied aggregates.
- Its nonterminal owning run is atomically failed with the existing safe `PUBLICATION_GUARD_REJECTED` diagnostic, and the invalid unshared tree is deleted through foreign-key cascades.
- Shared or superseded historical results are not rewritten or retroactively reranked.

This cleanup is local schema logic only until an operator separately reviews and applies the migration remotely.

## Application And Fallback Contracts

`RunOrchestratorRepository.materializeApprovedProposal` becomes an ID-only boundary. `RunOrchestrator.publish` no longer fetches verified quotes for materialization; quotes are read in the database transaction. The returned UUID is parsed strictly even if the orchestrator does not otherwise expose it.

An atomic RPC rejection continues to terminalize the run as `failed / PUBLICATION_GUARD_REJECTED`. Policy-budget exhaustion may retain the existing public-safe publication error while server logs record a more specific allowlisted diagnostic. No SQL exception text, proposal JSON, quote ID, or private-run metadata is exposed to clients.

The in-memory fallback store keeps staged all-or-nothing writes and replays `validateRecommendationPolicy`:

- immediately before creating any private or shared result;
- immediately before automatic sharing; and
- again immediately before host-confirmed superseding.

Fallback remains local-only and cannot prove PostgreSQL behavior, but its visible state transitions and fail-closed outcomes must match the durable path.

## Rejected Alternatives

### Compensating deletes in TypeScript

Deleting earlier inserts after a later request fails still exposes partial state between requests, can itself fail, and races with retries. It is not transactionality.

### Trusting `validation_decision` or a policy hash

Both are written through the application service role. Checking that they exist proves process history, not that persisted quote facts still produce the proposed winner.

### Replaying only totals

Correct sums can still describe a transfer route chosen despite available direct evidence, a non-minimal saving route, a fast combination outside the 130% bound, or the wrong city.

### Guarding automatic publication only

That leaves alternative previews vulnerable to partial materialization and lets host confirmation rely on weaker policy checks. Batch B covers every path that can create or share the canonical result tree.

## Failure-First Test Contract

### Atomicity and idempotency

- Scheme insertion failure leaves no result, scheme, or route row.
- Route insertion failure leaves no result, scheme, or route row.
- A retry after a committed exact tree returns the same result UUID and creates no duplicates.
- A legacy result-only or one-scheme draft is not accepted as complete.
- Repeated physical quote IDs across participants still resolve by `(participantId, quoteId)` and materialize participant-owned `verified_quote_id` rows.

### Database policy replay

- Reject a connecting selection when that participant has any eligible direct quote.
- Accept connecting evidence when that participant has no direct quote.
- Reject each incorrect saving tie-break: fare, transfers, duration, then quote ID.
- Reject fast totals above 130% and accept exactly 130%.
- Reject each incorrect fast tie-break: duration, latest arrival instant, transfers, fare, then ordered quote IDs.
- Reject a non-winning automatic city for each ranking tie-break: saving total, direct count, fairness, saving duration, then city code.
- Accept a requested alternative city that is policy-correct for itself even when it is not the automatic winner.
- Reject missing, extra, cross-run, cross-participant, wrong-city, wrong-mode, wrong-date, or task-mismatched evidence.
- Reject unknown policy versions and bounded-policy overflow without publishing partial output.
- Run identical policy fixtures through TypeScript and PostgreSQL and require identical ordered cities, selected `(participantId, quoteId)` pairs, and aggregates.

### Publication and migration

- Automatic publication replays policy again after materialization.
- Host confirmation replays requested-city policy again before superseding.
- A failed replay leaves the previous shared result current.
- Concurrent automatic publication still produces at most one current shared result.
- Concurrent host confirmations cannot supersede the wrong current result.
- The migration removes incomplete or policy-invalid unshared legacy trees and terminalizes only their nonterminal owning runs.
- Public roles cannot execute materialization, replay, publication, or confirmation helpers.

### Fallback parity

- A proposal invalidated after private materialization cannot be host-confirmed.
- Failed materialization mutates none of the staged result collections.
- Automatic and alternative paths retain the current shared result on every guard rejection.

Static SQL substring tests may supplement these cases but cannot be their primary evidence. Transaction rollback, concurrency, policy ordering, and role grants require executable PostgreSQL tests against a disposable local database.

## Verification And Handoff

After an approved failing-first plan is implemented, update `supabase/schema.sql`, add a forward-only hardening migration, and update `docs/architecture.md`, `docs/integration-guide.md`, `docs/superpowers/README.md`, and `.superpowers/sdd/progress.md`.

Run:

```bash
npm run lint
npm run test
npm run build
```

Also run the disposable PostgreSQL policy/transaction suite, `git diff --check`, and a staged-secret review. Gateway code is outside Batch B; its gates are required only if the implementation unexpectedly changes gateway files.

Passing local tests does not prove the migration is applied remotely and does not constitute live supplier publication acceptance.
