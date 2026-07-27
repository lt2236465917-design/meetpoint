# Repository Audit Batch B Remote Acceptance

**Date:** 2026-07-27

**Result:** PASS for remote migration and guarded publication RPCs; live supplier coverage remained incomplete.

## Code And Local Gates

- Verified commit: `7744069` on `codex/repository-audit-complete`.
- Root lint passed.
- Root Vitest passed 71 files / 457 tests.
- Production build passed after the managed sandbox's expected Turbopack local-port denial was rerun with local-process permission.
- Disposable PostgreSQL 17.10 passed 5 files / 74 tests.
- Diff/artifact/credential-pattern checks were clean. Gateway files were unchanged.

## Remote Migration

- Preflight `migration list` showed `202607190001` applied and `202607210001`, `202607260001` pending.
- `db push --dry-run` selected exactly those two pending migrations in timestamp order.
- A restricted local logical backup of `public` and `supabase_migrations` was created and validated before mutation; it was not stored in the repository.
- `202607210001_publication_safety_and_run_recovery.sql` and `202607260001_atomic_materialization_and_policy_replay.sql` applied successfully.
- Postflight migration history lists every local migration through `202607260001` as remote-applied.

## Remote Security And Publication Smoke

- `materialize_recommendation_result`, `publish_shared_result`, and `confirm_alternative_result` exist remotely.
- `anon` and `authenticated` have no `plans` read privilege; `anon` cannot execute materialization; `service_role` can.
- Zero business tables are present in `supabase_realtime` publication.
- A transaction-local fixed-evidence smoke materialized and published an automatic Wuhan result with exactly two schemes and four participant routes.
- The same transaction materialized and host-confirmed a Changsha alternative, superseded the prior result, and completed the alternative run.
- The transaction rolled back and a post-check found zero smoke-plan residue.

## Live Supplier Boundary

- Plan `T9YM95` / run `1a52e112-fb2c-4a81-84aa-5d586def12d8` verified `202 created` followed by `200 resume_existing` for the same automatic run.
- The bounded run ended `incomplete` with `REAL_QUOTE_COVERAGE_INCOMPLETE` after real high-speed-rail collection.
- Public projection exposed no shared city and zero schemes, proving no partial publication. This is not a completed live supplier publication pass.

## Remaining Boundary

- No push or deployment was performed.
- Credentials were not rotated; the previously accepted exposure risk remains.
- Batch C is proposed separately and was not implemented in this acceptance.
