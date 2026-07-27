# Input Integrity And Terminal UX Hardening Implementation Plan

**Status:** Reviewed — executing failing-first

**Design:** `docs/superpowers/specs/2026-07-27-input-integrity-and-terminal-ux-hardening-design.md`

**Goal:** Complete Repository Audit Batch C without changing recommendation policy, supplier behavior, or the shipped page IA.

## Rules

- Use one newly failing behavior at a time, then implement the smallest passing change.
- Update `AGENTS.md` with approved Batch C guardrails before production-code changes.
- Keep Supabase and fallback behavior equivalent.
- Do not add a migration unless a database constraint is proven necessary and the design is amended first.
- Do not push.

### Task 1: Approve Rules And Real Calendar Dates

**Files:** `AGENTS.md`, `src/lib/validation/calendar-date.ts`, `src/lib/validation/schemas.ts`, `src/lib/ui/create-plan-form.ts`, date/form/API tests.

- [x] Add approved permanent rules to `AGENTS.md` before implementation.
- [x] Add failing cases for nonexistent dates, leap years, and Shanghai minimum boundaries.
- [x] Implement one round-trip Gregorian calendar parser shared by API and form validation.
- [x] Verify focused tests and commit `fix: validate real plan calendar dates`.

### Task 2: Validate Canonical Departure Identity

**Files:** `src/lib/city/amap-client.ts`, `src/lib/city/city-provider.ts`, new server resolver, participant route/fallback store, provider and participant tests.

- [x] Add failing built-in and `amap-*` code/name mismatch tests.
- [x] Add a canonical resolver backed by `CITIES` or the selectable Amap administrative index.
- [x] Persist only resolver output; map mismatch to 400 and unavailable validation to 503.
- [x] Cover cached success, Amap outage, direct-admin units, prefectures, and province-administered cities.
- [x] Verify focused tests and commit `fix: bind departure cities to canonical identity`.

### Task 3: Make Plan-Code Creation Retry-safe

**Files:** `src/app/api/plans/route.ts`, `src/lib/fallback/mvp-store.ts`, `src/lib/ui/api-error-message.ts`, plan/fallback tests.

- [x] Add one failing case for collision-then-success, five collisions, and unrelated RPC failure.
- [x] Implement a five-attempt helper with injectable code generation.
- [x] Retry only the expected `plans.code` unique violation; keep credentials server-only and return them only after success.
- [x] Bound fallback behavior identically and add actionable Chinese copy.
- [x] Verify focused tests and commit `fix: retry plan code collisions safely`.

### Task 4: Align Fallback Arrival Aggregates

**Files:** `src/lib/fallback/mvp-store.ts`, fallback publication tests, policy parity fixtures.

- [ ] Add a failing fixture whose ISO lexical order differs from chronological order because of UTC offsets.
- [ ] Select the latest original timestamp by epoch and reject invalid instants.
- [ ] Re-run fallback publication and recommendation-policy parity tests.
- [ ] Commit `fix: compare fallback arrival instants chronologically`.

### Task 5: Preserve Private Preview Terminal UX

**Files:** `src/lib/recommendation/alternative-preview.ts`, `src/components/result/AlternativeCityFlow.tsx`, API error copy, alternative flow/read tests.

- [ ] Add failing SSR/client cases for `incomplete` and `failed` previews after direct-link reload.
- [ ] Return the requested canonical city in authorized private reads.
- [ ] Render terminal diagnosis and a true new-preview retry; hide host-confirmation guidance in unrelated states.
- [ ] Assert retry posts to `/previews` and never advances or refreshes the terminal run.
- [ ] Verify focused tests and commit `fix: keep terminal private previews actionable`.

### Task 6: Full Verification And Handoff

**Files:** current documentation and `.superpowers/sdd/progress.md`.

- [ ] Run focused Batch C tests.
- [ ] Run `npm run lint`, `npm run test`, and `npm run build`.
- [ ] If any database files changed, run the guarded PostgreSQL suite and document why.
- [ ] Review diff, staged paths, secrets, user-facing copy, and fallback parity.
- [ ] Update authority/current-runtime documentation and mark Batch C complete only from fresh evidence.
- [ ] Commit `docs: record Batch C input and terminal hardening`.
