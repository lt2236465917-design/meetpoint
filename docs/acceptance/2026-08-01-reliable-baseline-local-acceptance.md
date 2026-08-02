# Reliable Baseline And Live-Fare Enhancement — Local Acceptance

Date: 2026-08-01

## Implemented

- FlyAI exact enum compatibility accepts `flight` / `飞机` and `train` / `火车`, while ambiguous, mixed, and unknown labels remain rejected.
- Complete connecting-segment, mode consistency, real evidence, and redacted diagnostic guards remain in place.
- Matching schema drift opens a 60-second process-local circuit after two failures; invalid responses are not blindly retried.
- `probe:contract` executes the production adapter contract for flight and high-speed rail and emits only stable status/mode/count/category fields.
- Automatic candidate ranking uses every server-canonical departure coordinate, including `amap-*`; missing coordinates fail closed instead of using a default midpoint.
- Route tasks are candidate-first and participant-interleaved.
- Automatic runs persist a versioned baseline city independently from supplier-backed result/scheme/route tables.
- Result UI shows the baseline city before live progress and retains it through incomplete/failed live collection without fare, route, saving, or fast claims.
- The orchestrator has an explicit secondary-query capability seam and defaults safely to no secondary provider.

## Fresh verification

- Gateway lint: passed.
- Gateway tests: 8 files / 133 tests passed with local-port permission.
- Gateway build: passed.
- Contract probe command: passed structurally and returned `missing_credentials` for both modes; no credentialed live provider claim is made.
- Root lint: passed.
- Root tests: 75 files / 483 tests passed.
- Root production build and TypeScript: passed with local-process/port permission after the expected managed-sandbox denial.
- `git diff --check`: passed.
- Disposable PostgreSQL 17.10 behavior tests: 6 files / 76 tests passed, including migration-chain execution, canonical coordinates, baseline idempotency/mutation rejection, and browser-role denial.

## Operator work still required

1. Review and apply `202608010001_reliable_baseline_recommendation.sql` to the target Supabase project, then run guarded PostgreSQL parity/permission tests and a rollback-safe smoke.
2. Configure `FLYAI_API_KEY` in a deployment-safe environment and run the live contract probe before deployment; the local run intentionally had no credential.
3. Deploy the gateway and Web app, then create a fresh plan to verify the Chinese enum fix and baseline-to-live progressive UI on a phone.
4. Procure and implement a second commercial travel provider before enabling secondary routing. No secondary supplier is claimed or fabricated in this repository.
5. Configure monitoring for `PROVIDER_INVALID_RESPONSE`, schema-drift circuit openings, verified-quote coverage, and baseline/live-result divergence.

No push or production deployment was performed.
