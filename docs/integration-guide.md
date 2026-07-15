# Cross-City MeetPoint Integration Guide

This guide is the quick reference for running and calling the MVP locally.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill Supabase variables for persistent Supabase-backed runs. Without Supabase variables, the app uses an in-memory fallback store for local smoke testing.
4. Run the app with `npm run dev`.

The same user-facing routes are mobile-first and desktop responsive. On desktop, they should open as a centered phone-sized H5 canvas, not as a wide document page.

For local browser testing, open `http://127.0.0.1:<port>`; for real-phone testing, open the Network URL printed by `npm run dev`, for example `http://192.168.31.69:3000`. Both origins are allowed in `next.config.ts` so the browser can load Next.js development resources and keep client-side form submission behavior.

## Local Fallback Mode

If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, create, participant, candidate, calculate, and result routes use the server-side in-memory fallback store. It is non-persistent and never calls a supplier or creates an estimated result.

Use this mode to test creation, participation, authorization, and run-progress handling before provisioning Supabase:

1. Open `/create` and create a plan.
2. Return to `/` and confirm the plan appears in recent meeting records on the same device.
3. Use the public link to submit participants until the plan reaches its participant limit.
4. Keep `/p/[code]` open and confirm the filling records refresh without manually reloading the browser.
5. On a device that filled the plan, use `/p/[code]` to calculate after the plan is full.
6. Advance the pending run through its progress endpoint. Without test-injected verified quotes, it must end as `incomplete`; do not treat this mode as an end-to-end ticket or published-result smoke test.

Fallback data is cleared when the dev server restarts. Use Supabase variables for persistent handoff or deployment testing.

Recent meeting records are browser-local convenience data stored in `localStorage`. They help the same device return to plans that were created, opened, or joined, refresh when the user returns to a cached homepage tab, and are not shared across devices or treated as a security boundary.

## Environment Variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Public anon key for browser reads. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service-role key for route handlers and calculations. |
| `AMAP_API_KEY` | Server only | Local-miss Amap city validation for city-level selectable results. |
| `DEEPSEEK_API_KEY` | Server only | DeepSeek explanations and share copy only. |
| `DEEPSEEK_MODEL` | Server only | Optional server-side model override; defaults to `deepseek-v4-flash`. |
| `FLYAI_PROBE_CLI_PATH` | Server only | Optional operator-only executable override for the redacted FlyAI probe. |
| `TRAVEL_GATEWAY_URL` | Server only | Internal gateway URL used by the main-app travel provider. |
| `TRAVEL_GATEWAY_TOKEN` | Server only | Bearer token for the internal gateway. |
| `TRAVEL_GATEWAY_TIMEOUT_MS` | Server only | Main-app gateway request timeout; defaults to `30000` ms. |
| `TRAVEL_CALCULATION_TIMEOUT_MS` | Server only | Optional total travel-query budget override; without it, the budget is the greater of 45 seconds or 25 seconds per distinct route/mode group. |
| `TRAVEL_SECONDARY_QUERY_TIMEOUT_MS` | Server only | Second-pass budget for route groups unfinished in the first calculation pass; defaults to `15000` ms. |

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

`latestRun` exposes `{ runId, status, traceId, pendingGroups, retryAt, diagnosticCode }`. Any non-`"completed"` status is in progress, incomplete, or failed—not a result. `latestSharedResult` is present only when the latest run is `"completed"`.

### Search Cities

`GET /api/cities/search?q=上海`

Returns `{ "cities": [] }`. Built-in city matches return immediately. On a local miss and with `AMAP_API_KEY` configured, the server requests Amap input tips with a 3-second timeout, then returns normalized prefecture-level or municipality city matches such as `{ "code": "amap-440800", "name": "湛江", "province": "广东" }`. Amap failure, invalid data, missing credentials, and non-city locations safely return no remote selectable city.

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

### Regenerate Recommendation Explanations

`POST /api/plans/[code]/explain`

Regenerates explanations for the latest recommendation run. The route uses DeepSeek when `DEEPSEEK_API_KEY` is configured and deterministic fallback copy otherwise.

The server requests exactly four Chinese JSON fields: `short_reason`, `risk_badges`, `share_summary`, and `detail_explanation`. Unknown fields, blank values, or values without a Han character are rejected. Each provider attempt has a 15-second timeout and the SDK retries at most once; missing credentials, timeouts, request failures, empty content, malformed JSON, and schema-invalid output all use deterministic fallback copy without failing the endpoint.

Returns:

```json
{
  "ok": true,
  "count": 3
}
```

## Error Codes

| Error | Meaning |
| --- | --- |
| `INVALID_INPUT` | Request body failed validation. |
| `PLAN_NOT_FOUND` | The plan code does not exist. |
| `PARTICIPANT_LIMIT_REACHED` | The plan already has the maximum participant count. |
| `PARTICIPANT_TOKEN_REQUIRED` | Calculation was called without `x-participant-token`. |
| `INVALID_PARTICIPANT_TOKEN` | The participant token does not belong to this plan. |
| `PARTICIPANT_LIMIT_NOT_REACHED` | The plan is not full yet, so calculation is not allowed. |
| `CANDIDATE_EDITING_UNAVAILABLE` | Manual candidate editing is disabled in the current flow. |
| `CALCULATION_FAILED` | Recommendation calculation failed. |
| `CALCULATION_IN_PROGRESS` | A calculation for this plan is already running; clients should wait for polling refresh. |
| `RUN_NOT_FOUND` | No recommendation run exists for the plan. |

## Manual Smoke Path

1. Open `/create`, create a plan, and copy the public link.
2. Return to `/` and confirm the created plan appears in recent meeting records.
3. Open `/p/[code]/join`, submit participants until the plan reaches its participant limit.
4. After each participant submit, confirm the browser returns to `/p/[code]` and the filling records update without a manual refresh.
5. When the participant limit is reached on a device that filled the plan, use the public plan page's direct "开始计算" action.
6. Confirm the calculate request returns HTTP 202 and the advance endpoint reports a run ID and progress.
7. Without Supabase and supplier-backed verified quotes, confirm the fallback run ends `incomplete` and exposes no shared result. One-city/two-scheme UI, PostgreSQL migration, real supplier coverage, and device acceptance remain unfinished work.

## Responsive UI Checks

Use these checks after layout or component changes:

1. Open `/` at a desktop viewport around `1440x1000`; confirm the page appears as a centered phone-sized H5 canvas and no bottom-left Next.js `N` indicator appears.
2. Open `/create` at a mobile viewport around `390x844`; confirm the shell fills the visible screen height and the form remains a single-column H5 workflow.
3. Open `/p/[code]`, `/p/[code]/join`, and `/p/[code]/result` on desktop; confirm each route stays in the centered H5 canvas and does not switch to multi-column desktop layout.
4. On `/p/[code]/join`, type a departure city, confirm city candidates do not cover the transport-mode buttons, then select a city and confirm the candidates disappear.
5. Confirm no browser or framework overlay visually covers the right side of the app. If a red overlay appears while the DOM has no app-level fixed red element, check browser extensions before changing app CSS.
6. On `/create` in a WebKit/Chrome browser, click the middle of each date and time white field, then confirm the platform-native picker opens and the selected value appears. The native picker controls its own closing behavior.
7. On `/create`, click "参与人数上限". Confirm the app-styled 2–6 person panel opens, and selecting one option updates the field and closes the panel.

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
- `POST /v1/search` requires `Authorization: Bearer <TRAVEL_GATEWAY_TOKEN>` and a strict normalized request. It returns normalized `options` and an ISO `queriedAt`; the gateway's own cache remains an internal detail.
- Stable gateway errors are `UNAUTHORIZED`, `INVALID_REQUEST`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_NO_ROUTE`, `PROVIDER_NO_TICKET`, `PROVIDER_RATE_LIMITED`, `PROVIDER_UPSTREAM_UNAVAILABLE`, `PROVIDER_CLI_FAILED`, `PROVIDER_INVALID_RESPONSE`, and `INTERNAL_ERROR`. The service does not return provider exception text or raw response bodies.

The default FlyAI adapter additionally writes a server-only `flyai_diagnostic` event. Its allowed fields are `routeFingerprint`, `mode`, `outcome`, top-level/data/item field-name arrays, item/normalized/dropped counts, dropped validation categories, and `cliErrorCode`; it is neither an HTTP response, cache value, nor database record. It never includes supplier text, cities, fares, service numbers, times, URLs, identities, or secrets. A live `data.itemList` validates each item independently: a malformed item is dropped without losing a valid sibling, and only a non-empty list with no usable item becomes `PROVIDER_INVALID_RESPONSE`.

For main-app real-ticket smoke tests, also set these values in the root `.env.local`:

```env
TRAVEL_GATEWAY_URL=http://127.0.0.1:8080
TRAVEL_GATEWAY_TOKEN=<same value as services/travel-provider-gateway/.env>
```

If these root variables are missing, `src/lib/travel/gateway-client.ts` reports the gateway as not configured and the main app falls back to estimates. If `/v1/search` returns `404` with `PROVIDER_NO_ROUTE` or `PROVIDER_NO_TICKET`, the gateway reached FlyAI but no usable route fact was available for that route/mode. If it returns `429` with `PROVIDER_RATE_LIMITED`, reduce probe volume or wait for quota recovery; this includes FlyAI/Fliggy `MCP HTTP 403` risk-control responses such as abnormal access behavior. If it returns `503` with `PROVIDER_UNAVAILABLE` or `PROVIDER_UPSTREAM_UNAVAILABLE`, treat it as supplier instability until a redacted direct gateway probe proves otherwise. If it returns `502` with `PROVIDER_CLI_FAILED` or `PROVIDER_INVALID_RESPONSE`, inspect gateway deployment and adapter normalization before changing main-app fallback behavior. Stable provider error codes are retained on estimated fallback rows as `travel_options.failure_reason` and appear on result cards as the estimate reason, so result-page checks and operations review can distinguish rate limiting, upstream unavailability, invalid responses, and local gateway unavailability.

The gateway contract, cache/retry/concurrency behavior, and container policy are locally verified with fixtures. The gateway executes supplier calls one at a time, joins same-key cache misses to one in-flight call, and caches only successful normalized responses. The main app also submits distinct route/mode groups serially; its default total collection budget is the greater of 45 seconds or 25 seconds per group, while `TRAVEL_CALCULATION_TIMEOUT_MS` remains an explicit override. This alignment prevents queued successful responses from being discarded as generic estimates. `PROVIDER_RATE_LIMITED` never retries immediately: it applies a global 5-second cooldown, then a 15-second cooldown if the first post-cooldown supplier call is also limited. The main application likewise does not immediately retry a rate-limited mode; it creates an estimated row retaining `PROVIDER_RATE_LIMITED`. Timeout, unavailable, and upstream-unavailable failures still retry once. Run `npm run probe:providers` from the repository root only with operator-managed keys; it outputs only redacted status/count/latency/field-name summaries. Supplier coverage is unverified until a new full plan has produced route-fingerprint diagnostics after cooldown; neither `/healthz` nor a single successful fare row proves supplier-wide authorization, quota recovery, or production readiness.

After a supplier cooldown, use a new full plan for a live-ticket check. Real rows must still be labeled `飞猪参考价`; rows without a real response remain `估算` with their stable reason.

Treat any future Fliggy/FlyAI MCP as a gateway-side provider adapter. Before enabling it for recommendation runs, compare it against FlyAI with the same fixed origin/candidate/mode probe set and verify stable price units, China-time timestamps, safe booking URLs, error classifications, and production authorization.

## Real Ticket And Amap Acceptance

Use these checks after wiring FlyAI/Fliggy or another ticket source and Amap city data. Until a human confirms authorization, quota, real fields, price units, timestamp semantics, and booking-link behavior, treat supplier acceptance as unverified even when fixture tests pass.

1. Create a full plan with at least two departure cities and both flight and high-speed-rail preferences.
2. Confirm each selected per-participant route stores the provider source, real `price_cny`, `duration_minutes`, `depart_at`, `arrive_at`, and `service_name` in `travel_options`.
3. Open `/p/[code]/result` and confirm every recommendation card still shows the same shared city ranking to all viewers, plus each person's departure city, transport mode, real price, duration, and train number or flight number.
4. Confirm real FlyAI rows show train or flight number, station names when available, China-time departure and arrival time, duration, fare, "飞猪参考价", and a China-time query timestamp. Result cards must not render booking links or "去飞猪查看" actions.
5. Confirm estimated rows show "估算" plus a stable fallback reason when available, such as `PROVIDER_RATE_LIMITED` or `GATEWAY_UNAVAILABLE`; mixed real and fallback cards show "部分数据为估算".
6. Search city names through `/api/cities/search?q=...` and the join-page city combobox; confirm Amap-backed results normalize to the same city code/name shape used by recommendation and ticket lookup.

## DeepSeek Acceptance

1. Store a valid `DEEPSEEK_API_KEY` only in `.env.local` and optionally set `DEEPSEEK_MODEL`; never paste the key into commands, logs, or documentation.
2. Run the local app, complete a fallback-mode plan calculation, and call `POST /api/plans/[code]/explain`.
3. Confirm the response is `{ "ok": true, "count": <latest recommendation count> }`.
4. Confirm the latest recommendations contain non-empty Chinese explanations while rankings, scores, and travel options remain unchanged.
5. Temporarily use an invalid key and repeat; confirm deterministic fallback explanations are stored and the endpoint still succeeds.
