# Publication Safety And Run Recovery Design

**Date:** 2026-07-20

**Status:** Approved

**Scope:** Repository Security And State-Machine Audit, Batch A

## Purpose

Batch A closes two critical publication risks and four state-machine gaps without changing the recommendation policy, private-preview authority model, or result information architecture.

The implementation must:

1. normalize a FlyAI connecting itinerary from its complete ordered segment set;
2. remove anonymous database enumeration and make the HTTP API the only public projection;
3. require a current shared result before creating an alternative preview;
4. continue other route work after one route exhausts recovery;
5. recover safely from stale active runs; and
6. prevent automatic runs after a shared result already exists.

## Non-Goals

- Do not change candidate generation, winning-city policy, saving/fast selection, or evidence coverage requirements.
- Do not implement Batch B atomic materialization or database policy replay.
- Do not implement Batch C input validation or broad terminal-UX redesign.
- Do not access, apply, or claim the state of remote Supabase migrations.
- Do not perform live FlyAI supplier acceptance.
- Do not weaken requester-or-host preview reads or host-only confirmation.

## Approved Decisions

- Use database-atomic run creation guards with an explicit application contract.
- Resume a matching active run while it is fresh; expire and replace it after a bounded period without trusted activity.
- Use a 15-minute inactivity deadline for `pending` through `validating` and a 7-day deadline for `awaiting_host_confirmation`.
- Make server-rendered pages and HTTP route handlers the only public data projection. Browser clients receive no direct Supabase table access.
- Reject a connecting itinerary when its segments cannot be represented truthfully by the request's single transport mode.

## Architecture

The batch has five isolated responsibilities.

### FlyAI evidence normalization

`services/travel-provider-gateway/src/flyai-adapter.ts` converts one supplier item into one complete journey summary. It owns supplier parsing and evidence identity only. It does not generate candidates, score cities, persist participants, or select a recommendation.

### Anonymous-read isolation

A new migration tightens the already-deployed schema. `supabase/schema.sql` remains the canonical fresh-install schema. The application continues to query Supabase only through the service-role client in server code; public and private HTTP routes remain the authorization and projection boundaries.

### Atomic run creation

`create_recommendation_run_matrix` locks the plan, evaluates shared-result and active-run state, expires stale work, and either returns an existing matching run or inserts a new run and route matrix. Concurrency-sensitive invariants are decided in the database transaction rather than by application preflight queries.

### Bounded run advancement

`RunOrchestrator` continues healthy pending work after individual route groups exhaust recovery. Exhausted tasks become terminal facts; they do not force the entire run to become incomplete while other work can still create complete participant coverage.

### Fallback and contract parity

The in-memory fallback store mirrors the same run-creation dispositions, shared-result preconditions, stale deadlines, and terminal behavior. TypeScript contracts describe both paths so local mode cannot silently diverge from the durable path.

## FlyAI Multi-Segment Normalization

For every live `data.itemList` item:

1. Flatten every `journeys[].segments[]` entry in supplier array order.
2. Require between one and eight total segments. A larger supplier item is rejected instead of creating unbounded normalization or evidence-ID work.
3. Normalize every timestamp to an explicit offset before comparison.
4. Require each segment to arrive after it departs.
5. Require the ordered segments to move forward in time without overlap. An invalid, overlapping, or out-of-order item is dropped as a whole.
6. Use the first segment for the published departure time and departure station.
7. Use the last segment for the published arrival time and arrival station.
8. Derive total duration from first departure to final arrival, including transfer waits. A first-segment duration must never represent a connecting journey.
9. Set `transferCount` to `segmentCount - 1`; set `direct` only when `segmentCount === 1`.
10. Join ordered service identities for display, for example `MU5101 → MU5202`.
11. Require all segments to match the requested transport category. A mixed high-speed/normal-train item is rejected because the gateway contract has one `mode` and cannot represent the mixture faithfully.
12. Include the ordered normalized segment signature in evidence-ID material so journeys with the same outer schedule but different internal legs cannot collide.

Malformed sibling items remain isolated. If a non-empty item list produces no usable option, the adapter returns `PROVIDER_INVALID_RESPONSE`. Diagnostics add only an allowlisted dropped category such as `mixed_transport_category` or `invalid_segment_sequence`; they must not include supplier text, cities, times, fares, service identities, URLs, or raw payloads.

## Database Read Boundary

The new migration and canonical schema must remove direct anonymous access from every business table, including:

- `plans`, `participants`, `candidate_cities`, and `recommendation_runs`;
- legacy `travel_options`, `city_recommendations`, and `ai_explanations`;
- credential, route-task, quote, trace, and proposal tables; and
- recommendation result, scheme, and selected-route tables.

The migration must:

1. drop the existing broad public-read policies;
2. revoke table privileges from `public`, `anon`, and `authenticated`;
3. keep RLS enabled as defense in depth;
4. preserve explicitly reviewed `service_role` function execution; and
5. remove `participants`, `candidate_cities`, `recommendation_runs`, and `city_recommendations` from `supabase_realtime`, because the shipped application uses HTTP polling and has no browser Realtime subscription.

No anonymous SQL view or RPC replaces these policies. Public plan data is available only through server-rendered routes and `GET /api/plans/[code]`. That projection may expose the existing share-link fields—plan title/date/status, participant display fields, the latest automatic progress before publication, and the current shared result—but must never expose private-run kind, requester identity, requested city, private proposal metadata, or private result rows.

## Atomic Run-Creation Contract

The database RPC continues to return `jsonb`, parsed by a strict TypeScript schema. Its result is a closed union:

```ts
type RunCreationRpcResult =
  | {
      disposition: "created" | "resume_existing";
      runId: string;
      status: RunStatus;
      taskIds: string[];
    }
  | {
      disposition: "rejected";
      code:
        | "CALCULATION_IN_PROGRESS"
        | "SHARED_RESULT_EXISTS"
        | "SHARED_RESULT_REQUIRED";
    };
```

`created` always carries status `pending` and its inserted deterministic task IDs. `resume_existing` carries the active run's current status and an empty `taskIds` array. The repository converts a `rejected` value into a typed domain error; it must not infer business state from PostgreSQL error-message text.

The RPC performs this order inside one transaction:

1. validate the bounded candidate and task input;
2. lock the target `plans` row;
3. verify the plan meeting date and alternative requester ownership;
4. check the current non-superseded shared result;
5. lock the plan's active run, if any;
6. expire that run when `stale_after <= now()`;
7. return a matching fresh run or a structured rejection; and
8. otherwise insert the new run, candidates, and tasks.

### Automatic rules

- A current shared result returns `SHARED_RESULT_EXISTS`, even if another row would otherwise look resumable.
- Without a shared result, a fresh active automatic run returns `resume_existing`.
- A fresh active run of another kind returns `CALCULATION_IN_PROGRESS` without private metadata.
- An expired active run is atomically marked `failed` with `RUN_STALE_EXPIRED`, its lease and stale deadline are cleared, and the new automatic run is created in the same transaction.

### Alternative rules

- Absence of a current shared result returns `SHARED_RESULT_REQUIRED` before private active-run metadata is inspected.
- A fresh alternative may be resumed only when both `requested_by_participant_id` and `requested_city_code` match the new request.
- A fresh non-matching preview returns `CALCULATION_IN_PROGRESS` and no run ID.
- An expired preview may be atomically failed and replaced by the new preview.

Successful creation endpoints return HTTP `202` for `created` and HTTP `200` for `resume_existing`. Both responses give the caller a run ID and current status so the UI can enter the appropriate progress route.

## Stale-Run Semantics

`recommendation_runs.stale_after` becomes an enforced inactivity deadline.

- `pending`, `collecting`, `cooling_down`, `calculating`, and `validating` use 15 minutes.
- `awaiting_host_confirmation` uses 7 days.
- `completed`, `incomplete`, and `failed` have no stale deadline.

Trusted server-side activity refreshes the deadline:

- run creation;
- successful acquisition of an advance lease that begins one bounded advance;
- successful route-task outcome or recovery-exhaustion persistence;
- successful run-state transition; and
- transition into `awaiting_host_confirmation`, which switches to the 7-day deadline.

GET requests, page polling, and repeated reads do not refresh it.

The migration backfills existing active rows from `started_at + interval`, using the 7-day interval for `awaiting_host_confirmation` and 15 minutes for other active states. It does not run a background cleanup job. An expired row is terminalized by the next state-changing operation:

- `advance` terminalizes an expired `pending` through `validating` run so the authenticated automatic or private flow can create fresh work;
- run creation terminalizes an expired active row and creates the replacement atomically; and
- host confirmation rejects an expired preview with `PREVIEW_EXPIRED` and must not publish it.

Confirmation of a previously completed and shared preview remains idempotent.

## Route-Recovery Semantics

When `collecting`:

1. Return `calculating` immediately if any candidate already has complete participant quote coverage.
2. Ask `FallbackAgent` for decisions on each `retryable_failure` task.
3. Persist every `stop_incomplete` decision as `terminal_failure` while retaining an allowlisted safe error category.
4. Build the ready set from `pending` plus `rerun_task` decisions.
5. Execute at most one batch under the existing logical-concurrency limit.
6. If nothing is ready but a future `wait_until` exists, enter `cooling_down` until the earliest retry time.
7. Enter `incomplete / REAL_QUOTE_COVERAGE_INCOMPLETE` only when no complete city exists and no task is ready or waiting.

Persisting exhausted tasks removes them from `pendingGroups`; the public progress count must reflect work that can still advance. This change does not permit partial participant coverage or estimated quotes to reach Calculation or publication.

## Application Contracts And Errors

The implementation adds:

- `disposition` to successful run-creation results;
- `staleAfter` to the stored repository run contract;
- a repository operation that terminalizes exhausted route tasks with compare-and-set semantics; and
- strict schemas for the RPC union above.

Safe error codes are:

| Code | HTTP | Meaning and next action |
| --- | ---: | --- |
| `CALCULATION_IN_PROGRESS` | 409 | Another non-matching fresh run owns the plan; continue or wait without revealing private metadata. |
| `SHARED_RESULT_EXISTS` | 409 | The plan already has a shared result; view it or use the alternative flow. |
| `SHARED_RESULT_REQUIRED` | 409 | Complete the first automatic recommendation before requesting an alternative. |
| `PREVIEW_EXPIRED` | 409 | The private preview is too old to confirm; create it again with fresh evidence. |
| `RUN_STALE_EXPIRED` | n/a | Persisted terminal diagnostic for an expired run; create a fresh run through the existing authenticated boundary. |

Unexpected advance exceptions continue to be logged server-side with run ID, trace ID, status, and the error object. Public persistence remains limited to allowlisted diagnostics.

## Fallback Parity

The fallback store gains the same successful dispositions and business rejections. Its run rows track `staleAfter`, use the approved 15-minute and 7-day deadlines, reject automatic work after a shared result, and reject alternative creation before a shared result.

Fallback time-dependent tests use an injected clock or an equivalent deterministic test hook. Runtime fallback behavior remains local-only, has no supplier adapter, and never synthesizes estimates.

## Failure-First Test Plan

### Gateway

- A two-segment flight uses first departure, final arrival, full elapsed duration, one transfer, and both service identities.
- Multiple journey groups flatten in order.
- Mixed high-speed/normal-train segments are rejected.
- Invalid, overlapping, or out-of-order segments are rejected.
- A changed internal segment changes the evidence ID.
- Existing direct flight, high-speed, normal-train, redaction, sibling-isolation, and booking-URL tests remain green.

### Schema and RLS

- The new migration and canonical schema contain no broad anonymous read policy.
- All business tables revoke direct reads from `public`, `anon`, and `authenticated`.
- The four unused Realtime publication memberships are removed.
- Service-only RPC execution remains explicitly revoked from public roles and granted to `service_role`.
- The historical initial migration remains unchanged; the new migration safely tightens an already-deployed database.

### Orchestrator

- One exhausted retryable task becomes terminal while another pending task executes.
- Exhausted tasks no longer appear in pending work counts.
- The run becomes incomplete only after all ready/waiting work is gone.
- Coverage created by later healthy work moves the run to `calculating`.
- Stale advances terminalize through a compare-and-set path.

### Creation and privacy

- Automatic creation is rejected after a shared result exists.
- Alternative creation is rejected before a shared result exists.
- A matching fresh run returns `resume_existing`.
- A non-matching private preview returns only `CALCULATION_IN_PROGRESS`.
- An expired active run is failed and replaced atomically.
- An expired preview cannot be confirmed.
- The public plan projection contains no private preview metadata.
- Supabase and fallback modes return equivalent contracts and error codes.

## Verification And Handoff

After implementation, update `docs/architecture.md`, `docs/integration-guide.md`, and the authoritative progress ledger. Run:

```bash
npm run lint
npm run test
npm run build
```

Run the same three commands from `services/travel-provider-gateway/`, then run `git diff --check` and a staged-secret review.

Passing local schema tests do not prove the migration is applied remotely. The completion report must state that remote migration state and live supplier publication were not checked in this batch.
