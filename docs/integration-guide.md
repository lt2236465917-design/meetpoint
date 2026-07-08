# Cross-City MeetPoint Integration Guide

This guide is the quick reference for running and calling the MVP locally.

## Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill Supabase variables before calling persistence-backed routes.
4. Run the app with `npm run dev`.

## Environment Variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server | Public anon key for browser reads. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Service-role key for route handlers and calculations. |
| `AMAP_API_KEY` | Server only | Reserved for Amap autocomplete and validation fallback. |
| `DEEPSEEK_API_KEY` | Server only | DeepSeek explanations and share copy only. |
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
  "manageToken": "host-management-token",
  "shareUrl": "/p/ABC123"
}
```

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

Requires header:

```text
x-management-token: <manageToken>
```

Body:

```json
{
  "cityCode": "hangzhou",
  "cityName": "杭州",
  "enabled": true
}
```

Set `enabled` to `false` to exclude a city.

### Calculate Recommendations

`POST /api/plans/[code]/calculate`

Requires header:

```text
x-management-token: <manageToken>
```

Returns:

```json
{
  "runId": "...",
  "candidateCount": 12
}
```

Calculation also stores recommendation `explanation` and `risk_summary` fields for the result page.

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
| `MANAGEMENT_TOKEN_REQUIRED` | Host-only route was called without `x-management-token`. |
| `INVALID_MANAGEMENT_TOKEN` | Host token did not match the stored hash. |
| `SAVE_CANDIDATE_FAILED` | Candidate-city control persistence failed. |
| `CALCULATION_FAILED` | Recommendation calculation failed. |
| `RUN_NOT_FOUND` | No recommendation run exists for the plan. |

## Manual Smoke Path

1. Open `/create`, create a plan, and save the management token.
2. Open `/p/[code]/join`, submit at least two participants.
3. Open `/p/[code]/manage`, enter the management token, optionally edit candidate cities, and start calculation.
4. Open `/p/[code]/result`, confirm recommendation cards render explanations and stale-result warnings appear when applicable.
5. Optionally call `POST /api/plans/[code]/explain` and confirm the response count matches the latest run's recommendation rows.
