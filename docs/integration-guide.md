# Cross-City MeetPoint Integration Guide

This guide is the quick reference for running and calling the MVP locally.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill Supabase variables for persistent Supabase-backed runs. Without Supabase variables, the app uses an in-memory fallback store for local smoke testing.
4. Run the app with `npm run dev`.

The same user-facing routes must remain usable on phones (shareable plan links) and on desktop. Shipped UI uses a true adaptive layout without fake phone chrome — see `docs/superpowers/specs/2026-07-17-desktop-adaptive-shell-design.md`.

For local browser testing, open `http://127.0.0.1:<port>`; for real-phone testing, open the Network URL printed by `npm run dev`, for example `http://192.168.31.69:3000`. Both origins are allowed in `next.config.ts` so the browser can load Next.js development resources and keep client-side form submission behavior.

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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Public anon key for browser reads. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service-role key for route handlers and calculations. |
| `AMAP_API_KEY` | Server only | Local-miss Amap city validation for city-level selectable results. |
| `DEEPSEEK_API_KEY` | Server only | Provider-neutral Calculation/Supervisor model. |
| `DEEPSEEK_MODEL` | Server only | Optional server-side model override; defaults to `deepseek-v4-flash`. |
| `FLYAI_PROBE_CLI_PATH` | Server only | Optional operator-only executable override for the redacted FlyAI probe. |
| `PROBE_TRAVEL_DATE` | Operator shell only | Optional `YYYY-MM-DD` provider-probe date; defaults to the next UTC date. |
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
  "shareUrl": "http://192.168.31.69:3000/p/ABC123",
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

`latestRun` exposes `{ status, traceId, pendingGroups, retryAt, diagnosticCode }`. When a current shared result exists, the public projection stays anchored to the completed run that owns it; a pending private alternative run never hides or replaces that city. Without a shared result, `latestRun` reports the latest automatic run. `latestSharedResult` is present only when its owning run is `"completed"`.

### Search Cities

`GET /api/cities/search?q=上海`

Returns `{ "cities": [] }`. Today, built-in hub matches return immediately (local short-circuit). On a local miss and with `AMAP_API_KEY` configured, the server requests Amap input tips with a 3-second timeout, then returns normalized prefecture-level or municipality city matches such as `{ "code": "amap-440800", "name": "湛江", "province": "广东" }`. Amap failure, invalid data, missing credentials, and non-city locations safely return no remote selectable city. Approved next (not shipped): merge local hubs with Amap prefecture hits for the same query — `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md`.

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
  "status": "pending"
}
```

Both paths return HTTP 202 and do not wait for supplier work. The durable orchestrator uses only verified quotes, complete coverage, deterministic policy replay, Supervisor approval, a persisted advance lease, and the guarded publication RPC. The local fallback has the same state and publication rules but no supplier adapter, so it becomes `incomplete` unless tests inject verified quotes.

### Advance a Run

`POST /api/plans/[code]/runs/[runId]/advance`

Requires `x-participant-token`. Each request performs at most one state transition or one bounded query batch, then returns `{ runId, status, traceId, retryAt, diagnosticCode }`. The durable path persists an advance lease so repeated or concurrent requests return the current state rather than duplicate supplier work.

Run statuses are `pending`, `collecting`, `cooling_down`, `calculating`, `validating`, `awaiting_host_confirmation`, `completed`, `incomplete`, and `failed`. Only the `completed` run that owns the current non-superseded shared result may expose scheme cards. Before a shared result exists, every other automatic status exposes progress, retry, or diagnostic guidance instead.

### Create a Private Alternative Preview

`POST /api/plans/[code]/previews`

Requires `x-participant-token` from a participant in this plan and a canonical built-in city pair:

```json
{
  "cityCode": "hangzhou",
  "cityName": "杭州"
}
```

Returns HTTP 202 with the private run ID and initial status. The route-task matrix contains only the requested city, follows the normal verified-quote and review pipeline, and stops at `awaiting_host_confirmation` instead of changing the shared result.

### Read a Private Alternative Preview

`GET /api/plans/[code]/previews/[runId]`

Requires either the requesting participant's `x-participant-token` or the plan's `x-host-token`. It returns private run progress and, after approval, the one-city preview result. Other participants, missing or invalid credentials, and plan/run mismatches all receive 404 `PREVIEW_NOT_FOUND`, preventing the endpoint from revealing whether a private run exists.

### Confirm a Private Alternative Preview

`POST /api/plans/[code]/previews/[runId]/confirm`

Requires `x-host-token`; participant tokens, query parameters, request bodies, browser-local roles, and client-supplied proposal IDs are not confirmation authority. The server selects the exact Supervisor-approved proposal for the run and atomically replaces the shared result. A repeated successful confirmation is idempotent and returns the completed result without creating another replacement.

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
| `PREVIEW_NOT_FOUND` | The private preview is absent, belongs to another plan, or is not visible to this credential. |
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
| `PUBLICATION_GUARD_REJECTED` | The persisted proposal/result failed final deterministic publication checks. |

## Manual Smoke Path

1. Open `/create`, create a plan, and copy the public link.
2. Return to `/` and confirm the created plan appears in recent meeting records.
3. Open `/p/[code]/join`, submit participants until the plan reaches its participant limit.
4. After each participant submit, confirm the browser returns to `/p/[code]` and the filling records update without a manual refresh.
5. When the participant limit is reached on a device that filled the plan, use the public plan page's direct "开始计算" action.
6. Confirm the calculate request returns HTTP 202 and the advance endpoint reports a run ID and progress. On `/p/[code]/result` with a pending automatic run, confirm the page issues an authenticated bounded advance before refreshing; polling alone does not progress the run.
7. Without Supabase and supplier-backed verified quotes, confirm the fallback run ends `incomplete` and exposes no shared result. Task 14 evidence and non-blocking residual hygiene: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`.
8. With a completed fixture or Supabase-backed run, confirm the result page shows one city, exactly saving/fast schemes, every persisted participant route, China-time quote freshness, and no estimate, average-fare, three-city, or booking-link UI.
9. Create a preview with `POST /api/plans/[code]/previews` and `x-participant-token`; confirm its task matrix contains only the requested city. Read it with the requester token, then confirm another participant receives 404 for the same URL.
10. Confirm the public result still shows the prior shared city while the preview is pending. Send the preview URL to the host browser, confirm it once with `x-host-token`, and verify the replacement city appears. Treat repeated idempotency as an API/RPC test concern unless it is explicitly rerun on a device.

## Responsive UI Checks

Use these checks after layout or component changes:

1. Open `/` at a desktop viewport around `1440x1000`; confirm a full-bleed train-window hero (no fake phone chrome), zero-scroll opening with “发起见面计划” → `/create` and “最近记录” → `/records`, and no bottom-left Next.js `N` indicator.
2. Open `/create` at a mobile viewport around `390x844`; confirm the `ResponsiveShell` fills the visible screen height with the dark scenic-gradient canvas (not a white card shell), glass form panels, a usable single-column workflow, and no looping scenic video behind the form.
3. Open `/p/[code]`, `/p/[code]/join`, and `/p/[code]/result` on desktop; confirm each route uses the adaptive atmosphere shell (`max-w-2xl`, not a multi-column desktop dashboard or fake phone frame). On the public plan page expect one StatusLane panel (status + one primary CTA + `已填写` list). On the result page expect glass `.atmosphere-panel` scheme cards (no nested white route cards); while calculating or on city reveal, expect light `PeakScenicAccent` video (not behind create/join forms). Contracts: `docs/superpowers/specs/2026-07-17-plan-result-ia-design.md`, phase 4 in `docs/superpowers/specs/2026-07-17-ui-copy-and-visual-direction.md`, adaptive shell in `docs/superpowers/specs/2026-07-17-desktop-adaptive-shell-design.md`.
4. Open `/records` and confirm recent meeting records render in the adaptive shell with a back link to `/`.
5. On `/p/[code]/join`, type a departure city, confirm city candidates do not cover the transport-mode buttons, then select a city and confirm the candidates disappear.
6. Confirm no browser or framework overlay visually covers the right side of the app. If a red overlay appears while the DOM has no app-level fixed red element, check browser extensions before changing app CSS.
7. On `/create` in a WebKit/Chrome browser, click the middle of the “计划到达日期” field, then confirm the platform-native date picker opens and the selected value appears. The native picker controls its own closing behavior.
8. On `/create`, click "参与人数上限". Confirm the app-styled 2–6 person panel opens, and selecting one option updates the field and closes the panel.

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

The default FlyAI adapter additionally writes a server-only `flyai_diagnostic` event. Its allowed fields are `routeFingerprint`, `mode`, `outcome`, top-level/data/item field-name arrays, item/normalized/dropped counts, dropped validation categories, and `cliErrorCode`; it is neither an HTTP response, cache value, nor database record. It never includes supplier text, cities, fares, service numbers, times, URLs, identities, or secrets. A live `data.itemList` validates each item independently: a malformed item is dropped without losing a valid sibling, and only a non-empty list with no usable item becomes `PROVIDER_INVALID_RESPONSE`.

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
PROBE_TRAVEL_DATE=2026-08-20 npm run probe:providers
```

The probe outputs only redacted status/count/latency/field-name summaries. It is not supplier acceptance evidence: coverage remains unverified until a new full plan has produced route-fingerprint diagnostics after cooldown, and neither `/healthz` nor a single successful fare row proves supplier-wide authorization, quota recovery, or production readiness.

After a supplier cooldown, use a new full plan for a live-ticket check. Confirm both the Next.js app and `services/travel-provider-gateway` are reachable first (`GET /healthz` → `{ "status": "ok" }`); runs that end with `GATEWAY_UNAVAILABLE` and zero verified quotes are operator setup failures, not supplier-cooldown evidence. Prefer `npm run build && npm run start` for live publication when sandboxed `next dev` is unstable. A completed shared result must contain verified FlyAI routes for every participant in both schemes; any coverage gap must remain unpublished and end with retry/diagnostic guidance.

Treat any future Fliggy/FlyAI MCP as a gateway-side provider adapter. Before enabling it for recommendation runs, compare it against FlyAI with the same fixed origin/candidate/mode probe set and verify stable price units, China-time timestamps, safe booking URLs, error classifications, and production authorization.

## Real Ticket And Amap Acceptance

Use these checks after wiring FlyAI/Fliggy or another ticket source and Amap city data. Until a human confirms authorization, quota, real fields, price units, timestamp semantics, and booking-link behavior, treat supplier acceptance as unverified even when fixture tests pass.

1. Create a full plan with at least two departure cities and both flight and high-speed-rail preferences.
2. Confirm normalized supplier facts persist in `verified_quotes`, and each `recommendation_scheme_routes` row points to the exact verified quote selected for that participant.
3. Open `/p/[code]/result` and confirm all viewers see one shared city, exactly “省钱方案” and “省时方案”, team total fare/duration/transfers, and every participant route.
4. Confirm each route shows participant, departure city or station, transport/service, China-time departure and arrival, duration, transfer count, fare, provider label, short quote fingerprint, and China-time query timestamp.
5. Confirm the page contains no estimated fare, average fare, fairness/three-city ranking, or booking URL/action. If any participant lacks real coverage, confirm the run is `incomplete` and no scheme card is published.
6. Search city names through `/api/cities/search?q=...` and the join-page city combobox; confirm Amap-backed results normalize to the same city code/name shape used by recommendation and ticket lookup.

## DeepSeek Acceptance

1. Store a valid `DEEPSEEK_API_KEY` only in `.env.local` and optionally set `DEEPSEEK_MODEL`; never paste the key into commands, logs, or documentation.
2. DeepSeek V4 JSON mode requires the prompt to name JSON and describe the expected object shape. The adapter enforces this, caps the response at 4096 tokens, sends the top-level OpenAI-format `thinking: { type: "disabled" }` switch, and retries once on `MODEL_INVALID_OUTPUT`; do not move that thinking switch into a nested `extra_body` field in the JavaScript SDK.
3. For the active Supabase-backed flow, advance a fully covered run through `calculating` and `validating`; confirm Calculation selects only from persisted verified quote IDs, canonicalizes schemes for the winning city via deterministic policy replay, and the publication guard rechecks the approved proposal before `completed`.
4. Remove or invalidate the key and repeat with a new run; confirm it fails closed with `AGENT_MODEL_UNAVAILABLE` or a model validation diagnostic and publishes no result.
