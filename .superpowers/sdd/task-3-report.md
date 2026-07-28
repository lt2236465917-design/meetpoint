# Task 3 Report: Worker Run Selection Helpers And Repository Listing

## Status

**DONE**

## Summary

Added pure worker run selection helpers in `src/lib/recommendation/run-worker.ts` and `listWorkerAdvanceableRuns` on `RunOrchestratorRepository` / `SupabaseRecommendationRepository`. Selection prefers oldest `startedAt`, then stable `id` tie-break. Listing filters to `automatic`/`alternative` kinds and statuses `pending` through `validating` only (excludes `awaiting_host_confirmation`). No tick/loop and no auto-confirm of alternatives.

## TDD Evidence

1. Wrote `tests/run-worker.test.ts` selection cases first.
2. `npx vitest run tests/run-worker.test.ts -v` → FAIL (`Cannot find package '@/lib/recommendation/run-worker'`).
3. Implemented helpers + repository listing.
4. Re-ran → **3 passed**.

Note: Brief Step 1 imported unused `runWorkerTick` / `vi` (Task 4). Omitted those imports so selection tests can pass without implementing tick.

## Files

| Path | Action |
|------|--------|
| `src/lib/recommendation/run-worker.ts` | Created |
| `src/lib/recommendation/repository.ts` | Modified (interface + Supabase impl) |
| `tests/run-worker.test.ts` | Created |
| `tests/run-orchestrator.test.ts` | Stub `listWorkerAdvanceableRuns` for interface completeness (not in brief commit list) |

## Interfaces Delivered

- `WORKER_ADVANCEABLE_KINDS = ["automatic", "alternative"] as const`
- `WORKER_ADVANCEABLE_STATUSES = ["pending", "collecting", "cooling_down", "calculating", "validating"] as const`
- `WorkerAdvanceableRun`
- `isWorkerAdvanceableStatus`
- `selectNextWorkerRun`
- `RunOrchestratorRepository.listWorkerAdvanceableRuns(): Promise<WorkerAdvanceableRun[]>`

## Self-Review

- [x] No tick/loop (`runWorkerTick` not implemented)
- [x] No auto-confirm of alternatives
- [x] `awaiting_host_confirmation` not in advanceable statuses / listing filter
- [x] Service-role client via `createServiceSupabaseClient()` (same pattern as other repo methods)
- [x] Row mapping validates types and drops malformed rows via `flatMap`
- [x] Selection sort is pure and deterministic

## Fix Evidence (Important review — mock stub)

Command:

```bash
npx vitest run tests/run-orchestrator.test.ts tests/run-worker.test.ts -v
```

Result (2026-07-28):

```
Test Files  2 passed (2)
     Tests  17 passed (17)
  Duration  276ms
```

Follow-up commit: `54ed8a7` — `fix: stub listWorkerAdvanceableRuns on orchestrator test mock`

## Concerns

1. ~~Brief commit list omits `tests/run-orchestrator.test.ts`; a one-line stub was added so the mock still satisfies `RunOrchestratorRepository`. Include that file in the Task 3 commit or a follow-up.~~ Resolved in `54ed8a7`.
2. No integration/postgres test for `listWorkerAdvanceableRuns` yet (unit coverage is selection-only).
3. Listing caps at 50 rows; fair if worker ticks frequently, but backlog beyond 50 is invisible until older runs finish.
4. Order is DB `started_at` ascending; `selectNextWorkerRun` re-sorts in memory (id tie-break). If DB returns more than one page later, client-side tie-break still applies within the fetched page.

## Commits

- `0c6ef3f07debb2797b5de11941b05e9258a2b26f` — `feat: select oldest advanceable recommendation runs for the worker`
- `54ed8a7` — `fix: stub listWorkerAdvanceableRuns on orchestrator test mock`

## Next

Task 4: worker tick/loop using these helpers (do not auto-confirm alternatives).
