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
| `AMAP_API_KEY` | Server only | Reserved for Amap autocomplete and validation fallback. |
| `DEEPSEEK_API_KEY` | Server only | DeepSeek explanations and share copy only. |
| `DEEPSEEK_MODEL` | Server only | Optional server-side model override; defaults to `deepseek-v4-flash`. |
| `FLYAI_API_KEY` | Server only | Reserved for real ticket provider access. |
| `FLYAI_CLI_PATH` | Server only | Optional FlyAI CLI path. |

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

Returns `{ "cities": [] }` from the built-in city library.

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

Result rankings are shared for the whole plan. The result page shows the same top city recommendations to every participant, then breaks each card down into selected per-participant routes. In estimate mode these rows use deterministic fallback prices; after FlyAI/Amap or another ticket source is wired, the same `travel_options` rows can carry train or flight service names, real prices, and booking URLs.

### Regenerate Recommendation Explanations

`POST /api/plans/[code]/explain`

Regenerates explanations for the latest recommendation run. The route uses DeepSeek when `DEEPSEEK_API_KEY` is configured and deterministic fallback copy otherwise.

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
6. Open `/p/[code]/result`, confirm recommendation cards render explanations, team total fare, total duration, fairness gap, per-participant travel details, and stale-result warnings when applicable.
7. Optionally call `POST /api/plans/[code]/explain` and confirm the response count matches the latest run's recommendation rows.

## Responsive UI Checks

Use these checks after layout or component changes:

1. Open `/` at a desktop viewport around `1440x1000`; confirm the page appears as a centered phone-sized H5 canvas and no bottom-left Next.js `N` indicator appears.
2. Open `/create` at a mobile viewport around `390x844`; confirm the shell fills the visible screen height and the form remains a single-column H5 workflow.
3. Open `/p/[code]`, `/p/[code]/join`, and `/p/[code]/result` on desktop; confirm each route stays in the centered H5 canvas and does not switch to multi-column desktop layout.
4. On `/p/[code]/join`, type a departure city, confirm city candidates do not cover the transport-mode buttons, then select a city and confirm the candidates disappear.
5. Confirm no browser or framework overlay visually covers the right side of the app. If a red overlay appears while the DOM has no app-level fixed red element, check browser extensions before changing app CSS.

## Real Ticket And Amap Acceptance

Use these checks after wiring FlyAI/Fliggy or another ticket source and Amap city data:

1. Create a full plan with at least two departure cities and both flight and high-speed-rail preferences.
2. Confirm each selected per-participant route stores the provider source, real `price_cny`, `duration_minutes`, `depart_at`, `arrive_at`, and `service_name` in `travel_options`.
3. Open `/p/[code]/result` and confirm every recommendation card still shows the same shared city ranking to all viewers, plus each person's departure city, transport mode, real price, duration, and train number or flight number.
4. Confirm routes with a provider booking URL show the "去购票" action and open the provider URL; routes without a booking URL must keep the card usable and not show a broken purchase action.
5. Confirm real provider rows are not visually described as estimated prices. Mixed real and fallback rows must still mark the fallback rows clearly.
6. Search city names through `/api/cities/search?q=...` and the join-page city combobox; confirm Amap-backed results normalize to the same city code/name shape used by recommendation and ticket lookup.

## DeepSeek Acceptance

1. Store a valid `DEEPSEEK_API_KEY` only in `.env.local` and optionally set `DEEPSEEK_MODEL`; never paste the key into commands, logs, or documentation.
2. Run the local app, complete a fallback-mode plan calculation, and call `POST /api/plans/[code]/explain`.
3. Confirm the response is `{ "ok": true, "count": <latest recommendation count> }`.
4. Confirm the latest recommendations contain non-empty explanations while rankings, scores, and travel options remain unchanged.
5. Temporarily use an invalid key and repeat; confirm deterministic fallback explanations are stored and the endpoint still succeeds.
