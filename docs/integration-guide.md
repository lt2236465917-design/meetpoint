# Cross-City MeetPoint Integration Guide

This guide is the quick reference for running and calling the MVP locally.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill Supabase variables for persistent Supabase-backed runs. Without Supabase variables, the app uses an in-memory fallback store for local smoke testing.
4. Run the app with `npm run dev`.

The same user-facing routes are mobile-first and desktop responsive. On desktop, they should open as a centered phone-sized H5 canvas, not as a wide document page.

For real-phone testing, open the Network URL printed by `npm run dev`, for example `http://192.168.31.69:3000`. That LAN origin is allowed in `next.config.ts` so the phone can load Next.js development resources and keep client-side form submission behavior.

## Local Fallback Mode

If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, create, participant, candidate, calculate, and result routes use the server-side in-memory fallback store.

Use this mode to test the product flow before provisioning Supabase:

1. Open `/create` and create a plan.
2. Return to `/` and confirm the plan appears in recent meeting records on the same device.
3. Use the public link to submit participants until the plan reaches its participant limit.
4. Keep `/p/[code]` open and confirm the filling records refresh without manually reloading the browser.
5. On a device that filled the plan, use `/p/[code]` to calculate after the plan is full.
6. Open `/p/[code]/result`.

Fallback data is cleared when the dev server restarts. Use Supabase variables for persistent handoff or deployment testing.

Recent meeting records are browser-local convenience data stored in `localStorage`. They help the same device return to plans that were created, opened, or joined, but they are not shared across devices and are not a security boundary.

## Environment Variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Public anon key for browser reads. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service-role key for route handlers and calculations. |
| `AMAP_API_KEY` | Server only | Local-miss Amap city validation; results must map back to the built-in city library. |
| `DEEPSEEK_API_KEY` | Server only | DeepSeek explanations and share copy only. |
| `DEEPSEEK_MODEL` | Server only | Optional server-side model override; defaults to `deepseek-v4-flash`. |
| `FLYAI_PROBE_CLI_PATH` | Server only | Optional operator-only executable override for the redacted FlyAI probe. |
| `TRAVEL_GATEWAY_URL` | Server only | Internal gateway URL used by the main-app travel provider. |
| `TRAVEL_GATEWAY_TOKEN` | Server only | Bearer token for the internal gateway. |
| `TRAVEL_GATEWAY_TIMEOUT_MS` | Server only | Main-app gateway request timeout; defaults to `30000` ms. |
| `TRAVEL_CALCULATION_TIMEOUT_MS` | Server only | Total travel-query budget; defaults to `45000` ms. |

## API Quick Reference

### Create Plan

`POST /api/plans`

```json
{
  "title": "上海周末见面",
  "meetingDate": "2026-08-15",
  "targetArrivalTime": "18:00",
  "participantLimit": 4
}
```

Returns:

```json
{
  "code": "ABC123",
  "shareUrl": "http://192.168.31.69:3000/p/ABC123"
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

### Search Cities

`GET /api/cities/search?q=上海`

Returns `{ "cities": [] }`. Built-in city matches return immediately. On a local miss and with `AMAP_API_KEY` configured, the server requests Amap input tips with a 3-second timeout, then returns only exact matches mapped back to the built-in city library. Amap failure, invalid data, missing credentials, and unsupported locations safely return no remote selectable city.

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
  "candidateCount": 12
}
```

Calculation also stores recommendation `explanation` and `risk_summary` fields for the result page.

Result rankings are shared for the whole plan. The calculation service queries the gateway from server-side code once per distinct accepted mode, validates and deterministically orders valid real route facts, then maps them back to each participant. Gateway failures use estimates per mode; a successful empty result is unavailable. Result cards show provider source, query freshness, and safe booking actions from `travel_options.provider`, `queried_at`, and approved booking URLs.

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
| `RUN_NOT_FOUND` | No recommendation run exists for the plan. |

## Manual Smoke Path

1. Open `/create`, create a plan, and copy the public link.
2. Return to `/` and confirm the created plan appears in recent meeting records.
3. Open `/p/[code]/join`, submit participants until the plan reaches its participant limit.
4. After each participant submit, confirm the browser returns to `/p/[code]` and the filling records update without a manual refresh.
5. When the participant limit is reached on a device that filled the plan, use the public plan page's direct "开始计算" action.
6. Open `/p/[code]/result`, confirm recommendation cards render explanations, team total fare, total duration, fairness gap, source labels, query freshness where available, per-participant travel details, and stale-result warnings when applicable.
7. Optionally call `POST /api/plans/[code]/explain` and confirm the response count matches the latest run's recommendation rows.

## Responsive UI Checks

Use these checks after layout or component changes:

1. Open `/` at a desktop viewport around `1440x1000`; confirm the page appears as a centered phone-sized H5 canvas and no bottom-left Next.js `N` indicator appears.
2. Open `/create` at a mobile viewport around `390x844`; confirm the shell fills the visible screen height and the form remains a single-column H5 workflow.
3. Open `/p/[code]`, `/p/[code]/join`, and `/p/[code]/result` on desktop; confirm each route stays in the centered H5 canvas and does not switch to multi-column desktop layout.
4. On `/p/[code]/join`, type a departure city, confirm city candidates do not cover the transport-mode buttons, then select a city and confirm the candidates disappear.
5. Confirm no browser or framework overlay visually covers the right side of the app. If a red overlay appears while the DOM has no app-level fixed red element, check browser extensions before changing app CSS.

## Gateway Setup And Contract (internal service)

The gateway is independently deployable. Before starting it, copy `services/travel-provider-gateway/.env.example` to a local `.env` in that directory and set `FLYAI_API_KEY` and `TRAVEL_GATEWAY_TOKEN`; never commit either value. The gateway does not load `.env` itself, so export that file into the process environment before starting it.

```bash
cd services/travel-provider-gateway
npm ci
set -a && source .env && set +a
npm run dev
```

The gateway defaults to `PORT=8080`, matching the documented container port; an explicitly supplied `PORT` overrides it.

- `GET /healthz` returns `{ "status": "ok" }` without authentication or secrets.
- `POST /v1/search` requires `Authorization: Bearer <TRAVEL_GATEWAY_TOKEN>` and a strict normalized request. It returns normalized `options` and an ISO `queriedAt`; the gateway's own cache remains an internal detail.
- Stable gateway errors are `UNAUTHORIZED`, `INVALID_REQUEST`, `PROVIDER_TIMEOUT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_INVALID_RESPONSE`, and `INTERNAL_ERROR`. The service does not return provider exception text or raw response bodies.

For main-app real-ticket smoke tests, also set these values in the root `.env.local`:

```env
TRAVEL_GATEWAY_URL=http://127.0.0.1:8080
TRAVEL_GATEWAY_TOKEN=<same value as services/travel-provider-gateway/.env>
```

If these root variables are missing, `src/lib/travel/gateway-client.ts` reports the gateway as not configured and the main app falls back to estimates. If `/v1/search` returns `503` with `PROVIDER_UNAVAILABLE`, the main app has reached the gateway, but the gateway's FlyAI CLI call failed for that route/mode; treat this as a supplier coverage/quota/upstream problem until a redacted direct gateway probe proves otherwise.

The gateway contract, cache/retry/concurrency behavior, and container policy are locally verified with fixtures. Run `npm run probe:providers` from the repository root only with operator-managed keys; it outputs only redacted status/count/latency/field-name summaries. A 2026-07-12 credentialed probe confirmed Amap key access and FlyAI train field summaries. Direct gateway smoke confirmed live FlyAI flight/train rows, real source/provider fields, numeric string prices normalized to integer CNY, China-time departure/arrival timestamps, query freshness, and `a.feizhu.com` booking hosts. The main app batches travel searches at four concurrent provider requests, matching the gateway limiter so queued work does not consume client request timeouts. A 2026-07-13 full local calculation confirmed result-page `飞猪参考价` and `去飞猪查看` rows, but the run still stored `PARTIAL_ESTIMATE_FALLBACK` because direct gateway diagnostics returned `PROVIDER_UNAVAILABLE` for some route/mode pairs. Production enablement remains blocked on supplier route coverage/quota behavior and final user-flow acceptance. A real Docker image build remains unverified because the local Docker daemon was unavailable.

Treat any future Fliggy/FlyAI MCP as a gateway-side provider adapter. Before enabling it for recommendation runs, compare it against FlyAI with the same fixed origin/candidate/mode probe set and verify stable price units, China-time timestamps, safe booking URLs, error classifications, and production authorization.

## Real Ticket And Amap Acceptance

Use these checks after wiring FlyAI/Fliggy or another ticket source and Amap city data. Until a human confirms authorization, quota, real fields, price units, timestamp semantics, and booking-link behavior, treat supplier acceptance as unverified even when fixture tests pass.

1. Create a full plan with at least two departure cities and both flight and high-speed-rail preferences.
2. Confirm each selected per-participant route stores the provider source, real `price_cny`, `duration_minutes`, `depart_at`, `arrive_at`, and `service_name` in `travel_options`.
3. Open `/p/[code]/result` and confirm every recommendation card still shows the same shared city ranking to all viewers, plus each person's departure city, transport mode, real price, duration, and train number or flight number.
4. Confirm routes with an approved HTTPS Fliggy/Alitrip/Feizhu booking URL show the "去飞猪查看" action and the "价格和余票以跳转页面为准" note. Routes without an approved URL, and all estimated rows, must keep the card usable and show no booking action.
5. Confirm real FlyAI rows show "飞猪参考价" and a China-time query timestamp. Estimated rows show "估算"; mixed real and fallback cards show "部分数据为估算".
6. Search city names through `/api/cities/search?q=...` and the join-page city combobox; confirm Amap-backed results normalize to the same city code/name shape used by recommendation and ticket lookup.

## DeepSeek Acceptance

1. Store a valid `DEEPSEEK_API_KEY` only in `.env.local` and optionally set `DEEPSEEK_MODEL`; never paste the key into commands, logs, or documentation.
2. Run the local app, complete a fallback-mode plan calculation, and call `POST /api/plans/[code]/explain`.
3. Confirm the response is `{ "ok": true, "count": <latest recommendation count> }`.
4. Confirm the latest recommendations contain non-empty Chinese explanations while rankings, scores, and travel options remain unchanged.
5. Temporarily use an invalid key and repeat; confirm deterministic fallback explanations are stored and the endpoint still succeeds.
