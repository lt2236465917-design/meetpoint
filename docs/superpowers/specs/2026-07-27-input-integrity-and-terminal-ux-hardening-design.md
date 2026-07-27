# Input Integrity And Terminal UX Hardening Design

**Status:** Approved for implementation by operator on 2026-07-27

**Date:** 2026-07-27

## Problem

Repository Audit Batch C originally listed six concerns. Rechecking the Batch B final tree narrows the real remaining scope:

1. Participant creation accepts any syntactically valid departure `code` / `name` pair. A forged `amap-<adcode>` can therefore persist a false city identity even though search results are canonical.
2. Plan dates validate only `YYYY-MM-DD` shape and lexical minimum. Impossible dates such as `2026-02-31` can reach storage and fail as a generic creation error.
3. The deterministic fast policy already compares arrival instants as epoch timestamps, but fallback materialization still chooses `latestArrivalAt` by sorting ISO strings.
4. A private alternative preview that reaches `incomplete` or `failed` disappears from the UI because `AlternativeCityFlow` renders progress only for active statuses.
5. Durable plan creation generates one six-character code and converts every RPC error, including a uniqueness collision, into `CREATE_PLAN_FAILED`. Fallback retries collisions without a bound.

The earlier concern that a private run could replace public automatic progress is already fixed: both Supabase and fallback public reads select automatic runs only. It is not Batch C work.

## Goals

- Persist only a server-canonical departure identity.
- Reject nonexistent or past Shanghai calendar dates with actionable input feedback.
- Keep fallback aggregate timestamps equivalent to PostgreSQL and policy behavior.
- Keep private preview terminal failures visible and give the requester a real retry action.
- Retry plan-code collisions safely and finitely without retrying unrelated database failures.

## Non-goals

- No meeting-candidate expansion for `amap-*` departures.
- No policy-version change and no supplier/gateway changes.
- No redesign of alternatives/manage pages beyond terminal feedback.
- No change to public automatic-run selection; its existing regression remains.
- No remote migration is expected unless implementation discovers an inseparable database constraint.

## Design

### 1. Canonical departure identity

Add one server-only resolver in `src/lib/city/` used by both Supabase and fallback participant creation.

- Built-in codes resolve through `CITIES`; submitted names must equal the canonical normalized name.
- `amap-<adcode>` must contain a selectable six-digit administrative adcode and match the same canonical administrative-tree index used by search.
- The resolver returns canonical `{ code, name }`; callers persist that result, never the request copy.
- A mismatch returns `400 INVALID_DEPARTURE_CITY`.
- If an `amap-*` identity cannot be checked because Amap and the cached index are unavailable, fail closed with `503 CITY_VALIDATION_UNAVAILABLE` and Chinese retry guidance.
- Never promote input-tip district codes or accept a client-provided province as evidence.

### 2. Real Shanghai calendar dates

Replace regex-only validation with a parser that splits year/month/day, constructs a UTC date, and round-trips every component. Leap years follow the Gregorian calendar. Only a valid date may be compared lexically to the already validated Asia/Shanghai minimum.

Client parsing and `POST /api/plans` use the same helper. Past and nonexistent dates return `400 INVALID_INPUT`; the form distinguishes “日期不存在” from “日期已过去.”

### 3. Arrival instants

Fallback aggregate `latestArrivalAt` must compare `Date.parse()` epochs and retain the original winning ISO string. Invalid instants fail publication closed. Do not alter saving/fast selection or policy `2026-07-19.v2`.

### 4. Private preview terminal UX

`AlternativePreviewData` includes the requested canonical city so a terminal preview can be understood and retried after a direct URL load.

- `incomplete`: explain that this city lacks complete real fares, show diagnostic ID, and offer “重新查询这座城.”
- `failed`: show safe diagnostic guidance and the same bounded new-preview action.
- Retry creates a new run through `POST /previews`; it never refreshes or resumes the terminal run.
- Do not show “请发起人确认替换” until status is `awaiting_host_confirmation`.
- Return a private result only for `awaiting_host_confirmation` or `completed`; a terminal failure never renders a stale unshared result.
- Existing shared results stay unchanged throughout.

### 5. Collision-safe plan codes

Move durable plan creation behind a bounded helper with an injectable code generator for tests.

- Attempt at most five distinct codes.
- Retry only a confirmed unique violation on `plans.code` (`23505` plus the expected constraint/message).
- Generate the host token/hash once, keep it server-only, and return it only after one attempt succeeds.
- Non-collision errors fail immediately as `CREATE_PLAN_FAILED`.
- Five collisions return `PLAN_CODE_EXHAUSTED`; user copy asks the host to retry once.
- Fallback uses the same five-attempt bound and error.

## Security And Privacy

- City identity is derived server-side.
- Public error codes contain no Amap payload, database text, tokens, or credentials.
- Private preview reads keep requester-or-host authorization and 404 mismatch behavior.
- Code retries never log host tokens or token hashes.

## Acceptance

- Built-in and Amap code/name mismatch tests fail before persistence; canonical pairs pass.
- Nonexistent dates, leap-day boundaries, and past Shanghai dates are covered at helper, form, and API levels.
- Offset-different timestamps select the chronologically latest instant in fallback aggregates.
- `incomplete` and `failed` private previews remain visible after reload and start a new preview rather than refreshing the old run.
- Four collisions followed by success return one plan; five collisions fail deterministically; unrelated RPC errors are not retried.
- Public automatic progress selection regressions remain green.
- Root lint, full test suite, and production build pass.
