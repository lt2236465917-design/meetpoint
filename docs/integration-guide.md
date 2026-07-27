# Cross-City MeetPoint Integration Guide

This guide is the quick reference for running and calling the MVP locally.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill Supabase variables for persistent Supabase-backed runs. Without Supabase variables, the app uses an in-memory fallback store for local smoke testing.
4. Before running code that changes `POLICY_VERSION`, apply pending database migrations with `npx supabase migration list`, `npx supabase db push --dry-run`, then `npx supabase db push`. Never paste the database password into chat, logs, or project files.
5. Run the app with `npm run dev`.

The same user-facing routes must remain usable on phones (shareable plan links) and on desktop. Shipped UI uses a true adaptive layout without fake phone chrome — see `docs/superpowers/specs/2026-07-17-desktop-adaptive-shell-design.md`.

The hardening migrations are `supabase/migrations/202607210001_publication_safety_and_run_recovery.sql` and `supabase/migrations/202607260001_atomic_materialization_and_policy_replay.sql`; the Batch B migration remains synchronized with `supabase/schema.sql`. Both were applied to the linked Supabase project on 2026-07-27. Postflight migration, privilege, Realtime, and rollback-safe publication checks passed. The controlled supplier-backed run ended safely incomplete because real quote coverage was insufficient; see `docs/acceptance/2026-07-27-repository-audit-batch-b-remote-acceptance.md`.

For local database verification, point only at a disposable loopback PostgreSQL database whose name ends in `_test`:

```bash
TEST_DATABASE_URL='<local disposable PostgreSQL URL>' npm run test:postgres
```

The harness rejects remote hosts, protected/default databases, and names without the `_test` suffix, then rechecks the connected database before resetting schemas or applying migrations. Use this executable suite for transaction, concurrency, ordering, cleanup, and role proofs; static SQL substring tests do not replace it.

For local browser testing, open `http://127.0.0.1:<port>`; for real-phone testing, open the current Network URL printed by `npm run dev`. `next.config.ts` discovers active LAN IPv4 addresses at startup so the browser can load Next.js development resources after switching Wi-Fi networks.

## Local Fallback Mode

If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, create, participant, candidate, calculate, and result routes use the server-side in-memory fallback store. It is non-persistent and never calls a supplier or creates an estimated result.

Use this mode to test creation, participation, authorization, and run-progress handling before provisioning Supabase:

1. Open `/create` and create a plan.
2. Open `/records` (from the home hero “最近记录” entry or directly) and confirm the plan appears in recent meeting records on the same device.
3. Use the public link to submit participants until the plan reaches its participant limit.
4. Keep `/p/[code]` open and confirm the filling records refresh without manually reloading the browser.
5. On a device that filled the plan, use `/p/[code]` to calculate after the plan is full.
6. Advance the pending run through its progress endpoint. Without test-injected verified quotes, it must end as `incomplete`; do not treat this mode as an end-to-end ticket or published-result smoke test.

Fallback data is cleared when the dev server restarts. Use Supabase variables for persistent handoff or deployment testing.

Recent meeting records are browser-local convenience data stored in `localStorage` and shown on `/records`. They help the same device return to plans that were created, opened, or joined, refresh on same-tab updates / `storage` / `pageshow` / focus, and are not shared across devices or treated as a security boundary.

Pre-migration `city_recommendations` and `travel_options` are historical read-only data. They cannot become new published results. A pre-migration plan without a stored host credential may still view history but must create a new plan to use private previews and host confirmation.

## Environment Variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Public Supabase client bootstrap; it grants no direct business-table or Realtime reads. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service-role key for route handlers and calculations. |
| `AMAP_API_KEY` | Server only | Amap administrative-district lookup for non-hub prefecture-level departure cities. |
| `DEEPSEEK_API_KEY` | Server only | Provider-neutral Calculation/Supervisor model. |
| `DEEPSEEK_MODEL` | Server only | Optional server-side model override; defaults to `deepseek-v4-flash`. |
| `FLYAI_PROBE_CLI_PATH` | Server only | Optional operator-only executable override for the redacted FlyAI probe. |
| `PROBE_TRAVEL_DATE` | Operator shell only | Optional `YYYY-MM-DD` provider-probe date; defaults to the next UTC date. |
| `PROBE_FLYAI_SORT_TYPE` | Operator shell only | Optional redacted FlyAI probe sort: `3` for price ascending (default) or `8` for direct first. It never changes gateway production queries. |
| `TRAVEL_GATEWAY_URL` | Server only | Internal gateway URL used by the main-app travel provider. |
| `TRAVEL_GATEWAY_TOKEN` | Server only | Bearer token for the internal gateway. |
| `TRAVEL_GATEWAY_TIMEOUT_MS` | Server only | Main-app gateway request timeout; defaults to `30000` ms. |
| `AGENT_QUERY_CONCURRENCY` | Server only | Logical QueryAgent workers, clamped to `1..8`; defaults to `4` without increasing gateway supplier concurrency. |

## API Quick Reference

### Create Plan

`POST /api/plans`

```json
{
  "title": "上海周末见面",
  "arrivalDate": "2026-08-15",
  "participantLimit": 4
}
```

Returns:

```json
{
  "code": "ABC123",
  "shareUrl": "http://<current-lan-ip>:3000/p/ABC123",
  "hostToken": "returned-once-secret"
}
```

When the create request comes from `localhost` in local development, `shareUrl` uses the first available LAN IPv4 address so the copied link can open on a phone on the same network. In non-localhost environments, it uses the request host. If no host or LAN address is available, it falls back to `/p/[code]`.

### Read Plan

`GET /api/plans/[code]`

Returns:

```json
{
  "plan": {},
  "participants": [],
  "latestRun": null
}
```

`latestRun` exposes `{ status, traceId, pendingGroups, retryAt, diagnosticCode }`. When a current shared result exists, the public projection stays anchored to the completed run that owns it; a pending private alternative run never hides or replaces that city. Without a shared result, `latestRun` reports the latest automatic run. `latestSharedResult` is present only when its owning run is `"completed"`. This HTTP allowlist is the only unauthenticated business-data projection: browser roles cannot read business tables directly or subscribe to them through Realtime.

### Search Cities

`GET /api/cities/search?q=上海`

Returns `{ "cities": [] }`. Merges built-in hub matches with Amap city-level hits for the same query (local first, deduped by code/name). With `AMAP_API_KEY` configured, the server requests Amap administrative districts with a 5-second timeout and one bounded retry after request/response failure, and maintains a server-memory index loaded from the Amap China administrative tree as the full-coverage fallback. It adds normalized results such as `{ "code": "amap-440800", "name": "湛江", "province": "广东" }`; input tips are province-label enrichment only because their adcodes are commonly district-level. Failed index loads are not cached. Missing credentials and non-city locations still omit remote rows without blocking local hits — `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md`.

### Submit Participant

`POST /api/plans/[code]/participants`

```json
{
  "name": "李雷",
  "departureCityCode": "beijing",
  "departureCityName": "北京",
  "acceptedModes": ["flight", "high_speed_rail"]
}
```

Returns `{ "participantId": "...", "editToken": "..." }`.

### Candidate City Controls

`GET /api/plans/[code]/candidates`

Returns stored manual add/exclude controls.

`POST /api/plans/[code]/candidates`

Currently returns `410` with `CANDIDATE_EDITING_UNAVAILABLE`. Manual candidate editing needs a new non-management-token permission model before it is re-enabled.

### Calculate Recommendations

`POST /api/plans/[code]/calculate`

Requires header:

```text
x-participant-token: <editToken>
```

The token must belong to a participant who filled this plan, and the participant count must have reached the plan's participant limit.

Returns:

```json
{
  "runId": "...",
  "status": "pending",
  "disposition": "created"
}
```

The first request returns HTTP 202 with `disposition: "created"`; an identical active automatic request returns HTTP 200 with `disposition: "resume_existing"` and the persisted status instead of fabricating `pending`. A different active request returns `409 CALCULATION_IN_PROGRESS`. Automatic runs require the plan to be full and to have no shared result; after publication the route returns `409 SHARED_RESULT_EXISTS`. The durable orchestrator uses only verified quotes, complete coverage, Supervisor approval, a persisted advance lease, and service-only database RPCs. Under policy `2026-07-19.v2`, saving is the exact lowest verified direct-first fare across each participant's accepted modes (including direct normal train), while fast is the quickest direct-first team combination within 130% of the saving total. The database derives both schemes and aggregates from persisted evidence, inserts the full result tree through one atomic RPC, and replays the policy again immediately before automatic sharing. Unknown policy versions or replay work above 50,000 states / 200,000 transitions fail closed with the public-safe publication diagnostic. The local fallback stages the same result tree all-or-nothing and revalidates before materialization and sharing, but has no supplier adapter, so it becomes `incomplete` unless tests inject verified quotes.

### Advance a Run

`POST /api/plans/[code]/runs/[runId]/advance`

Requires `x-participant-token`. Each request performs at most one state transition or one bounded query batch, then returns `{ runId, status, traceId, retryAt, diagnosticCode }`. The durable path persists an advance lease so repeated or concurrent requests return the current state rather than duplicate supplier work. Active work has a rolling 15-minute inactivity deadline; an advance after expiry fails the run with `RUN_STALE_EXPIRED` before acquiring a new lease.

Run statuses are `pending`, `collecting`, `cooling_down`, `calculating`, `validating`, `awaiting_host_confirmation`, `completed`, `incomplete`, and `failed`. Exhausting recovery terminalizes only the affected route task; other ready or cooling-down routes continue. The run becomes `incomplete` only when no complete city coverage remains and all remaining route work is terminal. Only the `completed` run that owns the current non-superseded shared result may expose scheme cards. Before a shared result exists, every other automatic status exposes progress, retry, or diagnostic guidance instead.

### Create a Private Alternative Preview

`POST /api/plans/[code]/previews`

Requires `x-participant-token` from a participant in this plan and a canonical built-in city pair:

```json
{
  "cityCode": "hangzhou",
  "cityName": "杭州"
}
```

Preview creation requires an existing shared result; otherwise it returns `409 SHARED_RESULT_REQUIRED`. A new private run returns HTTP 202 with `disposition: "created"`, while the same participant/city active preview returns HTTP 200 with `disposition: "resume_existing"` and its persisted status. A conflicting active request returns `409 CALCULATION_IN_PROGRESS`. The route-task matrix contains only the requested city, follows the normal verified-quote and review pipeline, and stops at `awaiting_host_confirmation` instead of changing the shared result.

### Read a Private Alternative Preview

`GET /api/plans/[code]/previews/[runId]`

Requires either the requesting participant's `x-participant-token` or the plan's `x-host-token`. It returns private run progress and, after approval, the one-city preview result. Other participants, missing or invalid credentials, and plan/run mismatches all receive 404 `PREVIEW_NOT_FOUND`, preventing the endpoint from revealing whether a private run exists.

### Confirm a Private Alternative Preview

`POST /api/plans/[code]/previews/[runId]/confirm`

Requires `x-host-token`; participant tokens, query parameters, request bodies, browser-local roles, and client-supplied proposal IDs are not confirmation authority. The server selects the exact Supervisor-approved proposal for the run. The confirmation transaction replays the requested-city policy from persisted evidence immediately before atomically superseding and replacing the current shared result. Approval has a seven-day confirmation deadline. An unconfirmed expired preview returns `409 PREVIEW_EXPIRED`; a repeated successful confirmation remains idempotent and returns the completed result without creating another replacement.

## Error Codes

| Error | Meaning |
| --- | --- |
| `INVALID_INPUT` | Request body failed validation. |
| `PLAN_NOT_FOUND` | The plan code does not exist. |
| `PARTICIPANT_LIMIT_REACHED` | The plan already has the maximum participant count. |
| `PARTICIPANT_TOKEN_REQUIRED` | Calculation was called without `x-participant-token`. |
| `INVALID_PARTICIPANT_TOKEN` | The participant token does not belong to this plan. |
| `PARTICIPANT_LIMIT_NOT_REACHED` | The plan is not full yet, so calculation is not allowed. |
| `UNSUPPORTED_CITY` | The requested preview city is not a canonical supported city. |
| `SHARED_RESULT_EXISTS` | An automatic run cannot start after a shared result exists; read it or create a private alternative. |
| `SHARED_RESULT_REQUIRED` | A private alternative cannot start before the initial shared result exists. |
| `PREVIEW_NOT_FOUND` | The private preview is absent, belongs to another plan, or is not visible to this credential. |
| `PREVIEW_EXPIRED` | The seven-day host-confirmation window elapsed; create a new preview. |
| `HOST_TOKEN_REQUIRED` | Preview confirmation was called without `x-host-token`. |
| `INVALID_HOST_TOKEN` | The host token does not belong to this plan. |
| `APPROVED_PROPOSAL_NOT_FOUND` | No exact Supervisor-approved proposal is available for confirmation. |
| `HOST_CONFIRMATION_FAILED` | Atomic shared-result replacement failed after host authorization. |
| `CANDIDATE_EDITING_UNAVAILABLE` | Manual candidate editing is disabled in the current flow. |
| `CALCULATION_FAILED` | Recommendation calculation failed. |
| `CALCULATION_IN_PROGRESS` | A calculation for this plan is already running; clients should wait for polling refresh. |
| `RUN_NOT_FOUND` | No recommendation run exists for the plan. |

Terminal run progress may expose these `diagnosticCode` values without publishing result cards:

| Diagnostic | Meaning |
| --- | --- |
| `REAL_QUOTE_COVERAGE_INCOMPLETE` | At least one participant lacks a complete verified route for every required scheme; retry after supplier recovery. |
| `AGENT_MODEL_UNAVAILABLE` | The provider-neutral model could not be created; check server-only model credentials and availability. |
| `AGENT_PROPOSAL_INVALID` | Calculation/Supervisor output did not pass the bounded review and deterministic validators. |
| `PUBLICATION_GUARD_REJECTED` | The persisted proposal/result failed final deterministic publication checks, including unsupported policy versions or bounded SQL replay exhaustion. |

## Manual Smoke Path

1. Open `/create`, create a plan, and copy the public link.
2. Return to `/` and confirm the created plan appears in recent meeting records.
3. Open `/p/[code]/join`, submit participants until the plan reaches its participant limit.
4. After each participant submit, confirm the browser returns to `/p/[code]` and the filling records update without a manual refresh.
5. When the participant limit is reached on a device that filled the plan, use the public plan page's direct "开始见面" action.
6. Confirm a new calculate request returns HTTP 202 `created`, while an identical active request returns HTTP 200 `resume_existing`; the advance endpoint reports the same run ID and persisted progress. On `/p/[code]/result` with a pending automatic run, confirm the page issues an authenticated bounded advance before refreshing; polling alone does not progress the run.
7. Without Supabase and supplier-backed verified quotes, confirm the fallback run ends `incomplete` and exposes no shared result. Task 14 evidence and non-blocking residual hygiene: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`.
8. With a completed fixture or Supabase-backed run, confirm the result page shows one city, exactly saving/fast schemes, every persisted participant route, China-time quote freshness, and no estimate, average-fare, three-city, or booking-link UI.
9. Create a preview with `POST /api/plans/[code]/previews` and `x-participant-token`; confirm its task matrix contains only the requested city. Read it with the requester token, then confirm another participant receives 404 for the same URL.
10. Confirm the public result still shows the prior shared city while the preview is pending. Send the preview URL to the host browser, confirm it once with `x-host-token`, and verify the replacement city appears. Treat repeated idempotency as an API/RPC test concern unless it is explicitly rerun on a device.

## Responsive UI Checks

Use these checks after layout or component changes:

1. Open `/` at a desktop viewport around `1440x1000`; confirm a full-bleed train-window hero (brand `meetpoint`, no fake phone chrome), zero-scroll opening with “发起见面计划” → `/create` and “最近记录” → `/records`, and no bottom-left Next.js `N` indicator. Confirm all four clips continuously cycle and manual scene selection still works; only the active clip should load eagerly.
2. Open `/create` at a mobile viewport around `390x844`; confirm the `ResponsiveShell` fills the visible screen height with glass form panels, a usable single-column workflow, and the fixed 静水 clip under a readable dark scrim.
3. Open `/p/[code]`, `/p/[code]/join`, `/p/[code]/result`, `/records`, `/p/[code]/alternatives`, and `/p/[code]/manage`; confirm each route uses its fixed scene (plan=密林, join=静水, result=破晓, records=破晓, alternatives=静水, manage=密林) and never cycles all four. On the public plan page expect one StatusLane panel (status +「开始见面」CTA + `已填写` list). On the result page expect glass `.atmosphere-panel` scheme cards (no nested white route cards); while arranging or on city reveal, `PeakScenicAccent` must remain transparent glass over the one route-fixed video. Contracts: `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md`, `docs/superpowers/specs/2026-07-17-plan-result-ia-design.md`, adaptive shell in `docs/superpowers/specs/2026-07-17-desktop-adaptive-shell-design.md`.
4. Open `/records` and confirm recent meeting records render in the adaptive shell with a back link to `/`. 「查看」/「复制链接」should activate on a single click; a slow dynamic plan route must immediately change「查看」to「正在打开…」and show the plan loading shell. Browser translation cards are not app UI and should be disabled for localhost if they cover controls.
5. On `/p/[code]/join`, type a departure city, confirm city candidates do not cover the transport-mode buttons, then select a city and confirm the candidates disappear. Searching a prefecture such as「湛江」should be selectable when `AMAP_API_KEY` is configured.
6. Confirm no browser or framework overlay visually covers the right side of the app. If a red overlay appears while the DOM has no app-level fixed red element, check browser extensions / Next.js issue badge before changing app CSS.
7. On `/create` in a WebKit/Chrome browser, click the middle of the “计划到达日期” field, then confirm the platform-native date picker opens and the selected value appears. The native picker controls its own closing behavior.
8. On `/create`, click "参与人数上限". Confirm the app-styled 2–6 person panel expands in normal document flow below the trigger, pushes「生成邀请链接」down instead of covering it, and closes after selecting an option.

If a device still shows a static fallback, append `?videoDebug=1` to that route. The opt-in panel reports H.264 support, selected source, media/network state, dimensions, and playback errors; use「手动播放」to distinguish autoplay rejection from loading or decoding failure. The panel is absent without this query parameter.

## Gateway Setup And Contract (internal service)

The gateway is independently deployable. Before starting it, copy `services/travel-provider-gateway/.env.example` to a local `.env` in that directory and set `FLYAI_API_KEY` and `TRAVEL_GATEWAY_TOKEN`; never commit either value. The gateway does not load `.env` itself, so export that file into the process environment before starting it.

```bash
cd services/travel-provider-gateway
npm ci
set -a && source .env && set +a
npm run dev
```

The gateway defaults to `PORT=8080`, matching the documented container port; an explicitly supplied `PORT` overrides it.

- `GET /healthz` returns `{ "status": "ok" }` without authentication or secrets. A successful health response proves only that the gateway process is reachable; it does not prove FlyAI quota, risk-control clearance, or real-ticket availability.
- `POST /v1/search` requires `Authorization: Bearer <TRAVEL_GATEWAY_TOKEN>` and a strict normalized request with `originCityCode`, `originCityName`, `destinationCityCode`, `destinationCityName`, `departureDate`, and `mode`. It returns normalized real `options`, ISO `queriedAt`, `traceId`, and cache status. Each option carries a stable gateway-issued `quoteId` plus nullable upstream-native `providerQuoteId`; the gateway's own cache remains an internal detail.
- Stable gateway errors are `UNAUTHORIZED`, `INVALID_REQUEST`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_NO_ROUTE`, `PROVIDER_NO_TICKET`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UPSTREAM_UNAVAILABLE`, `PROVIDER_CLI_FAILED`, `PROVIDER_INVALID_RESPONSE`, and `INTERNAL_ERROR`. Every error response carries `traceId` and nullable `retryAfterMs`; only `PROVIDER_RATE_LIMITED` may return a non-null retry delay. The service does not return provider exception text or raw response bodies.

The default FlyAI adapter additionally writes a server-only `flyai_diagnostic` event. Its fixed allowlisted fields are `routeFingerprint`, `mode`, `outcome`, `itemCount`, `normalizedCount`, `droppedCount`, `droppedReasons`, and `cliErrorCode`; it is neither an HTTP response, cache value, nor database record. Supplier key names are not recorded. It never includes supplier text, cities, fares, service numbers, times, URLs, identities, or secrets. A live `data.itemList` validates each item independently: a malformed item is dropped without losing a valid sibling, and only a non-empty list with no usable item becomes `PROVIDER_INVALID_RESPONSE`.

For main-app real-ticket smoke tests, also set these values in the root `.env.local`:

```env
TRAVEL_GATEWAY_URL=http://127.0.0.1:8080
TRAVEL_GATEWAY_TOKEN=<same value as services/travel-provider-gateway/.env>
```

If these root variables are missing, `src/lib/travel/gateway-client.ts` reports the gateway as unavailable. In the active Multi-Agent path, route tasks follow bounded retry/cooldown rules and incomplete real coverage ends without publishing a shared result; it never converts the missing evidence into an estimate. If `/v1/search` returns `404` with `PROVIDER_NO_ROUTE` or `PROVIDER_NO_TICKET`, the gateway reached FlyAI but no usable route fact was available for that route/mode. If it returns `429` with `PROVIDER_RATE_LIMITED`, reduce probe volume or wait for quota recovery; this includes FlyAI/Fliggy `MCP HTTP 403` risk-control responses such as abnormal access behavior. If it returns `503` with `PROVIDER_UNAVAILABLE` or `PROVIDER_UPSTREAM_UNAVAILABLE`, treat it as supplier instability until a redacted direct gateway probe proves otherwise. If it returns `502` with `PROVIDER_CLI_FAILED` or `PROVIDER_INVALID_RESPONSE`, inspect gateway deployment and adapter normalization before changing retry policy.

The gateway contract, cache/retry/concurrency behavior, and container policy are locally verified with fixtures. The gateway executes supplier calls one at a time, joins same-key cache misses to one in-flight call, and caches only successful normalized responses. QueryAgent also serializes physical route/mode work and shares identical in-flight keys. `PROVIDER_RATE_LIMITED` never retries immediately: it applies a global 5-second cooldown, then a 15-second cooldown if the first post-cooldown supplier call is also limited; the run exposes `cooling_down` and a retry time. Retryable failures receive bounded recovery, while missing complete real coverage ends `incomplete`.

Run the redacted provider probe only from an operator shell. Keep FlyAI credentials in the gateway environment file and export them only for the command:

```bash
set -a
source .env.local
source services/travel-provider-gateway/.env
set +a
PROBE_TRAVEL_DATE=2026-08-20 PROBE_FLYAI_SORT_TYPE=3 npm run probe:providers
PROBE_TRAVEL_DATE=2026-08-20 PROBE_FLYAI_SORT_TYPE=8 npm run probe:providers
```

The FlyAI probe leaves journey type unfiltered to mirror production route discovery and outputs only redacted status/count/latency/field-name plus direct/connecting/unclassified-count summaries. The sort switch exists only for fixed-route operator comparisons. It is not supplier acceptance evidence: coverage remains unverified until a new full plan has produced route-fingerprint diagnostics after cooldown, and neither `/healthz` nor a single successful fare row proves supplier-wide authorization, quota recovery, or production readiness.

After a supplier cooldown, use a new full plan for a live-ticket check. Confirm both the Next.js app and `services/travel-provider-gateway` are reachable first (`GET /healthz` → `{ "status": "ok" }`); runs that end with `GATEWAY_UNAVAILABLE` and zero verified quotes are operator setup failures, not supplier-cooldown evidence. Prefer `npm run build && npm run start` for live publication when sandboxed `next dev` is unstable. A completed shared result must contain verified FlyAI routes for every participant in both schemes; any coverage gap must remain unpublished and end with retry/diagnostic guidance.

An `incomplete` or `failed` automatic run is terminal and is never resumed in place. The result page's retry action creates a new run through `POST /api/plans/{code}/calculate` using the browser-local participant credential. `RUN_ADVANCE_FAILED` remains the public diagnostic code; inspect the server log entry tagged `[recommendation-run] advance failed` for the original exception and its run/trace context.

Treat any future Fliggy/FlyAI MCP as a gateway-side provider adapter. Before enabling it for recommendation runs, compare it against FlyAI with the same fixed origin/candidate/mode probe set and verify stable price units, China-time timestamps, safe booking URLs, error classifications, and production authorization.

## Real Ticket And Amap Acceptance

Use these checks after wiring FlyAI/Fliggy or another ticket source and Amap city data. Until a human confirms authorization, quota, real fields, price units, timestamp semantics, and booking-link behavior, treat supplier acceptance as unverified even when fixture tests pass.

1. Create a full plan with at least two departure cities and both flight and high-speed-rail preferences.
2. Confirm normalized supplier facts persist in `verified_quotes`, and each `recommendation_scheme_routes` row points to the exact verified quote owned by that participant. The same physical `quoteId` may legitimately repeat across participants; publication must resolve it by `(participant_id, quote_id)`, not by quote ID alone.
3. Open `/p/[code]/result` and confirm all viewers see one shared city, exactly “省钱方案” and “省时方案”, team total fare/duration/transfers, and every participant route.
4. Confirm each route shows participant, departure city or station, transport/service, China-time departure and arrival, duration, transfer count, fare, provider label, short quote fingerprint, and China-time query timestamp.
5. Confirm the page contains no estimated fare, average fare, fairness/three-city ranking, or booking URL/action. If any participant lacks real coverage, confirm the run is `incomplete` and no scheme card is published.
6. Search city names through `/api/cities/search?q=...` and the join-page city combobox; confirm Amap-backed results normalize to the same city code/name shape used by recommendation and ticket lookup.

## DeepSeek Acceptance

1. Store a valid `DEEPSEEK_API_KEY` only in `.env.local` and optionally set `DEEPSEEK_MODEL`; never paste the key into commands, logs, or documentation.
2. DeepSeek V4 JSON mode requires the prompt to name JSON and describe the expected object shape. The adapter enforces this, caps the response at 4096 tokens, sends the top-level OpenAI-format `thinking: { type: "disabled" }` switch, and retries once on `MODEL_INVALID_OUTPUT`; do not move that thinking switch into a nested `extra_body` field in the JavaScript SDK.
3. For the active Supabase-backed flow, advance a fully covered run through `calculating` and `validating`; confirm Calculation selects only from persisted verified quote IDs, canonicalizes schemes for the winning city via deterministic policy replay, and the publication guard rechecks the approved proposal before `completed`.
4. Remove or invalidate the key and repeat with a new run; confirm it fails closed with `AGENT_MODEL_UNAVAILABLE` or a model validation diagnostic and publishes no result.
