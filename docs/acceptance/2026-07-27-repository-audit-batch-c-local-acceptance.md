# Repository Audit Batch C Local Acceptance

**Date:** 2026-07-27

**Result:** PASS — input integrity and terminal UX hardening completed locally.

## Implemented

- Real Gregorian plan-date validation rejects nonexistent dates before storage and distinguishes nonexistent from past dates in the create form.
- Participant creation resolves built-in or Amap departure code/name pairs server-side and persists only the canonical identity. Mismatches fail with 400; unavailable Amap verification fails closed with actionable 503 guidance.
- Durable and fallback plan creation retry only code collisions, stop after five attempts, and fail unrelated storage errors immediately.
- Fallback materialization validates and compares arrival timestamp instants rather than ISO text order.
- Private alternative `incomplete` / `failed` states survive reload with requested-city context, safe diagnostics, and a new-preview retry. Terminal runs are never refreshed or advanced, and host-confirmation guidance appears only while awaiting confirmation.

## Commits

- `470de03` — approve Batch C rules and execution contract.
- `1abb71d` — validate real plan calendar dates.
- `35a8c76` — bind departure cities to canonical identity.
- `6b9578a` — retry plan-code collisions safely.
- `aced130` — compare fallback arrival instants chronologically.
- `ef4ce2f` — keep terminal private previews actionable.

## Fresh Verification

- Root lint passed.
- Root Vitest passed 74 files / 476 tests.
- Production build and TypeScript passed after the managed sandbox's expected Turbopack local-port denial was rerun with local-process permission.
- Focused suites covered date helper/form/API, city resolver/provider/participant API, Supabase and fallback code collisions, policy/fallback arrival parity, and private preview rendering/retry/authorization.
- Diff and credential-pattern checks passed before handoff.

## Boundaries

- No database schema or migration changed, so the guarded PostgreSQL suite was not required for Batch C.
- Gateway files did not change, so gateway gates were not rerun.
- No push or deployment was performed.
- Credential rotation was explicitly deferred by the operator; known exposure risk remains accepted and unresolved.
