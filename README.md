# Cross-City MeetPoint

Mobile-first H5 MVP for choosing a fair cross-city meeting city for 2-6 people in China.

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run test`
- `npm run build`

## Current Flow

- `/`: focused creation entry for the H5 app.
- `/create`: host creates a meeting plan and receives a public link plus a management token.
- `/p/[code]`: public plan page with meeting summary, participant completion state, join entry, and result entry.
- `/p/[code]/join`: participant submits name, departure city, and accepted transport modes.
- `/p/[code]/manage`: host enters the management token, edits candidate cities, and manually starts calculation.
- `/p/[code]/result`: decision-first result page showing the latest recommendation run and stale-result warning.
- `POST /api/plans`: creates a plan from `{ title, meetingDate, targetArrivalTime, participantLimit }` and returns `{ code, manageToken, shareUrl }`.
- `GET /api/plans/[code]`: returns `{ plan, participants, latestRun }` for public plan reads.
- `GET /api/cities/search?q=...`: searches built-in city data and returns `{ cities }`.
- `POST /api/plans/[code]/participants`: creates a participant and returns `{ participantId, editToken }`.
- `GET /api/plans/[code]/candidates`: returns stored candidate city controls for a plan.
- `POST /api/plans/[code]/candidates`: saves a host candidate-city add/exclude control from `{ cityCode, cityName, enabled }`; requires `x-management-token`.
- `POST /api/plans/[code]/calculate`: manually calculates recommendations for a plan and returns `{ runId, candidateCount }`; requires `x-management-token`.
- `POST /api/plans/[code]/explain`: regenerates DeepSeek/fallback explanations for the latest run and returns `{ ok, count }`.

## Core Modules

- `src/lib/city/candidate-generator.ts`: deterministic candidate-city generation from participant cities and host controls.
- `src/lib/city/city-provider.ts`: local-first city search shell; Amap key is reserved for autocomplete/validation fallback.
- `src/lib/travel/types.ts`: normalized travel-provider boundary for provider adapters.
- `src/lib/travel/estimate-provider.ts`: deterministic estimated travel option fallback using city distance and transport mode.
- `src/lib/travel/flyai-provider.ts`: FlyAI provider shell that currently falls back to estimated options until production access is configured.
- `src/lib/recommendation/scoring.ts`: deterministic city scoring and primary recommendation selection.
- `src/lib/recommendation/calculate-run.ts`: manual calculation orchestration that generates candidates, queries travel options, stores recommendation explanations, and marks results stale after 30 minutes.
- `src/lib/ai/recommendation-explainer.ts`: DeepSeek explanation shell with deterministic fallback copy for missing, failed, or malformed model output.

## Environment

Copy `.env.example` to `.env.local` and fill server-side keys locally.

Supabase variables:

- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL used by browser and server clients.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key for browser-side reads.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key for route handlers and background calculations.
- `AMAP_API_KEY`: server-side Amap key reserved for city autocomplete and validation fallback.
- `DEEPSEEK_API_KEY`: server-side DeepSeek key for explanation and share-copy generation only.
- `FLYAI_API_KEY`: server-side FlyAI key reserved for real ticket provider access.
- `FLYAI_CLI_PATH`: optional server-side FlyAI CLI path; the MVP shell returns estimates until production access is wired.

## Verification

Run after code changes:

```bash
npm run lint
npm run test
npm run build
```

In managed sandboxes, `npm run build` can fail if Next/Turbopack is blocked from creating a process and binding a local port. Re-run the same command in an environment that permits local port binding before release.

## MVP Verification

Run before handoff:

```bash
npm run lint
npm run test
npm run build
```

Manual H5 acceptance:

1. Create a plan.
2. Open the public link.
3. Submit two participants from different cities.
4. Start calculation from the manage page.
5. Open result page and verify recommendation cards render.
6. Confirm estimates are visually marked and stale results show a warning after `stale_after`.
