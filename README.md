# Cross-City MeetPoint

Mobile-first H5 MVP for choosing a fair cross-city meeting city for 2-6 people in China. The same routes render as a centered phone-sized H5 canvas on desktop, and the app has a development fallback mode that can run the create-to-result flow without Supabase credentials.

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run test`
- `npm run build`

## Current Flow

- `/`: focused creation entry plus local recent meeting records saved on this device.
- `/create`: host creates a meeting plan, receives a phone-openable public link, and saves the plan to local recent records.
- `/p/[code]`: public plan page with meeting summary, participant completion state, filling records, join entry, result entry, automatic participant-status refresh, and a direct calculate action for local participants when the participant limit is reached.
- `/p/[code]/join`: participant submits name, departure city, and accepted transport modes, then returns to the public plan page automatically.
- `/p/[code]/manage`: legacy route that points users back to the public plan page.
- `/p/[code]/result`: shared team result page showing the latest recommendation run, stale-result warning, team total fare, total duration, fairness gap, and per-participant travel details.
- `POST /api/plans`: creates a plan from `{ title, meetingDate, targetArrivalTime, participantLimit }` and returns `{ code, shareUrl }`; local development requests from `localhost` return a LAN `shareUrl` when available.
- `GET /api/plans/[code]`: returns `{ plan, participants, latestRun }` for public plan reads.
- `GET /api/cities/search?q=...`: searches built-in city data and returns `{ cities }`.
- `POST /api/plans/[code]/participants`: creates a participant and returns `{ participantId, editToken }`.
- `GET /api/plans/[code]/candidates`: returns stored candidate city controls for a plan.
- `POST /api/plans/[code]/candidates`: currently returns `CANDIDATE_EDITING_UNAVAILABLE`.
- `POST /api/plans/[code]/calculate`: manually calculates recommendations for a full plan and returns `{ runId, candidateCount }`; requires `x-participant-token` from a participant who filled the plan.
- `POST /api/plans/[code]/explain`: regenerates DeepSeek/fallback explanations for the latest run and returns `{ ok, count }`.

## Core Modules

- `src/lib/city/candidate-generator.ts`: deterministic candidate-city generation from participant cities and host controls.
- `src/lib/city/city-provider.ts`: local-first city search shell; Amap key is reserved for autocomplete/validation fallback.
- `src/lib/fallback/mvp-store.ts`: server-side in-memory fallback store for local create-to-result smoke testing when Supabase variables are missing.
- `src/lib/travel/types.ts`: normalized travel-provider boundary for provider adapters, including service names and booking URLs when a real ticket source provides them.
- `src/lib/travel/estimate-provider.ts`: deterministic estimated travel option fallback using city distance and transport mode.
- `src/lib/travel/flyai-provider.ts`: FlyAI provider shell that currently falls back to estimated options until production access is configured.
- `src/lib/recommendation/scoring.ts`: deterministic city scoring and primary recommendation selection; each candidate city is scored from one selected route per participant rather than summing every accepted transport mode.
- `src/lib/recommendation/calculate-run.ts`: manual calculation orchestration that generates candidates, queries travel options, stores recommendation explanations, and marks results stale after 30 minutes.
- `src/lib/ai/recommendation-explainer.ts`: DeepSeek explanation shell with deterministic fallback copy for missing, failed, or malformed model output.
- `src/lib/ui/meeting-history.ts`: browser-only local recent-record storage; it caches `useSyncExternalStore` snapshots so the homepage does not trigger React update loops.

## Environment

Copy `.env.example` to `.env.local` and fill server-side keys locally for persistent Supabase-backed runs.

If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, the app uses the in-memory fallback store. This is only for local smoke testing: data is kept in the dev server process and is cleared when the server restarts.

For mobile-device testing against the local dev server, use the Network URL printed by `npm run dev`, such as `http://192.168.31.69:3000`. `next.config.ts` allows that development origin so mobile browsers can load Next.js dev resources instead of degrading client forms to ordinary GET submissions.

Supabase variables:

- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL used by browser and server clients.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key for browser-side reads.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key for route handlers and background calculations.
- `AMAP_API_KEY`: server-side Amap key reserved for city autocomplete and validation fallback.
- `DEEPSEEK_API_KEY`: server-side DeepSeek key for explanation and share-copy generation only.
- `DEEPSEEK_MODEL`: optional server-side model override; defaults to `deepseek-v4-flash`.
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

For UI changes, also verify a mobile viewport around `390x844` and a desktop viewport around `1440x1000`. The desktop routes should render as a centered phone-sized H5 canvas, not a wide document page or marketing page.

## MVP Verification

Run before handoff:

```bash
npm run lint
npm run test
npm run build
```

Manual H5 acceptance:

1. Create a plan.
2. Return to `/` and confirm the created plan appears in recent meeting records on the same device.
3. Open the public link.
4. Submit two participants from different cities.
5. Confirm the public plan page updates filling records without a manual browser refresh.
6. After the participant limit is reached, start calculation from the public plan page on a device that has filled the plan.
7. Open result page and verify all participants see the same top city recommendations, with per-participant travel details inside each card.
8. Confirm estimates are visually marked and stale results show a warning after `stale_after`.
