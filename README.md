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
- `GET /api/cities/search?q=...`: searches the built-in city library first, then uses Amap only to validate and map a local miss back to a supported city; returns `{ cities }`.
- `POST /api/plans/[code]/participants`: creates a participant and returns `{ participantId, editToken }`.
- `GET /api/plans/[code]/candidates`: returns stored candidate city controls for a plan.
- `POST /api/plans/[code]/candidates`: currently returns `CANDIDATE_EDITING_UNAVAILABLE`.
- `POST /api/plans/[code]/calculate`: manually calculates recommendations for a full plan and returns `{ runId, candidateCount }`; requires `x-participant-token` from a participant who filled the plan.
- `POST /api/plans/[code]/explain`: regenerates DeepSeek/fallback explanations for the latest run and returns `{ ok, count }`.

## Core Modules

- `src/lib/city/candidate-generator.ts`: deterministic candidate-city generation from participant cities and host controls.
- `src/lib/city/amap-client.ts` and `src/lib/city/city-provider.ts`: local-first city search with a 3-second server-side Amap validation fallback; only cities in the built-in library are selectable.
- `src/lib/fallback/mvp-store.ts`: server-side in-memory fallback store for local create-to-result smoke testing when Supabase variables are missing.
- `src/lib/travel/types.ts`: normalized travel-provider boundary, including gateway request/response types and query timestamps for real prices.
- `src/lib/travel/estimate-provider.ts`: deterministic estimated travel option fallback using city distance and transport mode.
- `src/lib/travel/gateway-client.ts` and `src/lib/travel/flyai-provider.ts`: server-side authenticated gateway client and per-mode provider fallback; real route facts are deterministically ordered before scoring.
- `services/travel-provider-gateway/`: independently runnable FlyAI gateway with strict contracts, safe CLI execution, cache, concurrency limit, retry, authenticated HTTP API, and container configuration.
- `src/lib/recommendation/scoring.ts`: deterministic city scoring and primary recommendation selection; each candidate city is scored from one selected route per participant rather than summing every accepted transport mode.
- `src/lib/recommendation/calculate-run.ts`: manual calculation orchestration that generates candidates, queries travel options, stores recommendation explanations, and marks results stale after 30 minutes.
- `src/lib/ai/recommendation-explainer.ts`: DeepSeek explanation boundary with strict Chinese JSON validation and deterministic fallback copy for missing, failed, timed-out, or malformed model output.
- `src/lib/ui/meeting-history.ts`: browser-only local recent-record storage; it caches `useSyncExternalStore` snapshots so the homepage does not trigger React update loops.

## Environment

Copy `.env.example` to `.env.local` and fill server-side keys locally for persistent Supabase-backed runs.

If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, the app uses the in-memory fallback store. This is only for local smoke testing: data is kept in the dev server process and is cleared when the server restarts.

For mobile-device testing against the local dev server, use the Network URL printed by `npm run dev`, such as `http://192.168.31.69:3000`. `next.config.ts` allows that development origin so mobile browsers can load Next.js dev resources instead of degrading client forms to ordinary GET submissions.

Supabase variables:

- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL used by browser and server clients.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key for browser-side reads.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key for route handlers and background calculations.
- `AMAP_API_KEY`: server-side Amap key for local-miss city validation and mapping; it never expands the scoring city library.
- `DEEPSEEK_API_KEY`: server-side DeepSeek key for explanation and share-copy generation only.
- `DEEPSEEK_MODEL`: optional server-side model override; defaults to `deepseek-v4-flash`.
- `FLYAI_PROBE_CLI_PATH`: optional operator-only executable override for the redacted FlyAI capability probe.
- `TRAVEL_GATEWAY_URL`: server-side internal gateway URL used by the main-app travel provider.
- `TRAVEL_GATEWAY_TOKEN`: server-side bearer token for the internal gateway.
- `TRAVEL_GATEWAY_TIMEOUT_MS`: optional main-app gateway request timeout; defaults to `30000` ms.
- `TRAVEL_CALCULATION_TIMEOUT_MS`: optional total travel-query budget; defaults to `45000` ms.

DeepSeek requests use a 15-second timeout and at most one SDK retry. Provider failures never fail recommendation calculation or change deterministic rankings; they return local fallback explanations instead.

## Travel Provider Status

Tasks 1-10 of the [Amap and FlyAI implementation plan](docs/superpowers/plans/2026-07-12-amap-flyai-integration.md) are complete: Amap city validation, travel query freshness persistence, the isolated gateway, main-app authenticated client, deterministic travel-search orchestration, and source/freshness result UI are fixture-verified. The app uses real normalized route facts when the gateway succeeds; per-mode failures fall back to deterministic estimates, while successful empty results remain unavailable rather than pretending to be estimates.

Result cards show real FlyAI rows as `飞猪参考价` with the China-time query timestamp. Estimates are marked `估算`, mixed cards show `部分数据为估算`, and booking actions appear only for real FlyAI rows with approved HTTPS Fliggy/Alitrip links. If the latest run has no primary recommendation label because no candidate is feasible for every participant, the result page asks the organizer to adjust the target arrival time or meeting date instead of presenting an unlabeled city as a recommendation.

The gateway has its own environment file at `services/travel-provider-gateway/.env.example` and commands:

```bash
cd services/travel-provider-gateway
npm ci
npm run lint
npm run test
npm run build
```

The gateway exposes `GET /healthz` and authenticated `POST /v1/search`. It accepts only supported normalized requests, calls FlyAI through an argument-array CLI invocation with shell execution disabled, and returns stable error codes. Its 5-minute cache, four-call concurrency limit, 12-second provider timeout, and one retry are process-local.

Run `npm run probe:providers` only with operator-managed keys. It prints a single redacted JSON summary (status, latency, count, and field names), never provider payload values. Production enablement remains blocked until authorization, quota, actual field semantics, price units, timestamp behavior, and booking-link hosts are confirmed with a credentialed probe. The Dockerfile policy and gateway build are verified; an actual Docker image build still needs a running Docker daemon.

## Verification

Run after code changes:

```bash
npm run lint
npm run test
npm run build
```

For gateway changes, also run:

```bash
cd services/travel-provider-gateway
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
