# Cross-City MeetPoint

Mobile-first H5 MVP for choosing a fair cross-city meeting city for 2-6 people in China. The same routes render as a centered phone-sized H5 canvas on desktop, and the app has a development fallback mode that can run the create-to-result flow without Supabase credentials.

## Multi-Agent Migration Status

The approved [2026-07-15 Multi-Agent design](docs/superpowers/specs/2026-07-15-multi-agent-recommendation-design.md) is in progress. Tasks 1–9 are implemented in code: plans use an arrival date and host credential, verified quote evidence and route tasks are persisted, deterministic saving/fast/unique-city policy and agent review exist, and the Supabase path advances bounded runs before atomic publication. Task 9 still awaits independent review; Tasks 10–14 are not complete. Do not describe the target experience as released.

The legacy MVP details below apply only to paths not yet migrated, especially the local fallback store and current result UI. They are not the target publication contract.

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
- `/p/[code]/result`: shared team result page that shows recommendation cards only after the latest run completes; while it is running, it reports progress, refreshes locally for a bounded period, and keeps a manual refresh action.
- `POST /api/plans`: creates a plan from `{ title, arrivalDate, participantLimit }` and returns `{ code, shareUrl, hostToken }`; the host token is returned once.
- `GET /api/plans/[code]`: returns public plan data, `latestRun` progress, and `latestSharedResult` only when the latest run is `completed`.
- `GET /api/cities/search?q=...`: searches the built-in city library first, then uses Amap to validate city-level local misses; returns `{ cities }`.
- `POST /api/plans/[code]/participants`: creates a participant and returns `{ participantId, editToken }`.
- `GET /api/plans/[code]/candidates`: returns stored candidate city controls for a plan.
- `POST /api/plans/[code]/candidates`: currently returns `CANDIDATE_EDITING_UNAVAILABLE`.
- `POST /api/plans/[code]/calculate`: creates a bounded automatic run and returns HTTP 202 `{ runId, status: "pending" }`; requires `x-participant-token`.
- `POST /api/plans/[code]/runs/[runId]/advance`: advances at most one state transition or one bounded query batch; requires `x-participant-token`.
- `POST /api/plans/[code]/explain`: regenerates DeepSeek/fallback explanations for the latest run and returns `{ ok, count }`.

## Core Modules

- `src/lib/city/candidate-generator.ts`: deterministic candidate-city generation from participant cities and host controls.
- `src/lib/city/amap-client.ts` and `src/lib/city/city-provider.ts`: local-first city search with a 3-second server-side Amap validation fallback for city-level results.
- `src/lib/fallback/mvp-store.ts`: server-side in-memory fallback store for local create-to-result smoke testing when Supabase variables are missing.
- `src/lib/travel/types.ts`: normalized travel-provider boundary, including gateway request/response types and query timestamps for real prices.
- `src/lib/travel/estimate-provider.ts`: deterministic estimated travel option fallback using city distance and transport mode, with the upstream fallback reason preserved when available.
- `src/lib/travel/gateway-client.ts` and `src/lib/travel/flyai-provider.ts`: server-side authenticated gateway client and per-mode provider fallback; real route facts are deterministically ordered before scoring, and stable gateway error codes are retained on estimated fallback rows.
- `services/travel-provider-gateway/`: independently runnable FlyAI gateway with strict contracts, safe CLI execution, cache, concurrency limit, retry, authenticated HTTP API, and container configuration.
- `src/lib/recommendation/policy.ts` and `validators.ts`: deterministic direct-first saving/fast schemes, unique-city ranking, evidence replay, and bounded policy evaluation.
- `src/lib/agent/`: provider-neutral model boundary plus Manager, Query, Calculation, Supervisor, Fallback, tracing, and bounded orchestration modules.
- `src/lib/agent/run-orchestrator.ts`: creates and incrementally advances Supabase-backed runs; it replaces the old synchronous calculation path.
- `src/lib/ui/meeting-history.ts`: browser-only local recent-record storage; it caches `useSyncExternalStore` snapshots so the homepage does not trigger React update loops.

## Environment

Copy `.env.example` to `.env.local` and fill server-side keys locally for persistent Supabase-backed runs.

If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, the app uses the in-memory fallback store. This is only for local smoke testing: data is kept in the dev server process and is cleared when the server restarts.

For local browser testing, use `http://127.0.0.1:<port>`; for mobile-device testing, use the Network URL printed by `npm run dev`, such as `http://192.168.31.69:3000`. `next.config.ts` allows both development origins so Next.js client resources and interactive forms load correctly.

Supabase variables:

- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL used by browser and server clients.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public anon key for browser-side reads.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key for route handlers and background calculations.
- `AMAP_API_KEY`: server-side Amap key for local-miss city validation; Amap-backed city-level results can be selected even when they are not in the local scoring city library.
- `DEEPSEEK_API_KEY`: server-side DeepSeek key for explanation and share-copy generation only.
- `DEEPSEEK_MODEL`: optional server-side model override; defaults to `deepseek-v4-flash`.
- `FLYAI_PROBE_CLI_PATH`: optional operator-only executable override for the redacted FlyAI capability probe.
- `TRAVEL_GATEWAY_URL`: server-side internal gateway URL used by the main-app travel provider.
- `TRAVEL_GATEWAY_TOKEN`: server-side bearer token for the internal gateway.
- `TRAVEL_GATEWAY_TIMEOUT_MS`: optional main-app gateway request timeout; defaults to `30000` ms.
- `TRAVEL_CALCULATION_TIMEOUT_MS`: optional total travel-query budget override. Without an override, the main app budgets `25000` ms per distinct route/mode group, with a `45000` ms minimum, so the budget matches the serial supplier gateway instead of discarding queued real results.
- `TRAVEL_SECONDARY_QUERY_TIMEOUT_MS`: optional second-pass travel-query budget for unfinished searches; defaults to `15000` ms.

DeepSeek requests use a 15-second timeout and at most one SDK retry. Provider failures never fail recommendation calculation or change deterministic rankings; they return local fallback explanations instead.

For local real-ticket smoke tests, run the gateway separately and set `TRAVEL_GATEWAY_URL=http://127.0.0.1:8080` in `.env.local`. The `.env.local` `TRAVEL_GATEWAY_TOKEN` must match `services/travel-provider-gateway/.env`; otherwise the main app treats the gateway as unavailable and falls back to estimates.

## Travel Provider Status

Tasks 1-10 of the [Amap and FlyAI implementation plan](docs/superpowers/plans/2026-07-12-amap-flyai-integration.md) are complete: Amap city validation, travel query freshness persistence, the isolated gateway, main-app authenticated client, deterministic travel-search orchestration, and source/freshness result UI are fixture-verified. The app uses real normalized route facts when the gateway succeeds; per-mode failures fall back to deterministic estimates, while successful empty results remain unavailable rather than pretending to be estimates.

The legacy fallback result cards show real FlyAI rows as `飞猪参考价` with the China-time query timestamp, train or flight number, stations where available, time range, duration, and fare. Estimates are marked `估算` and include the stable fallback reason when one is available, such as `PROVIDER_RATE_LIMITED` or `GATEWAY_UNAVAILABLE`; mixed cards show `部分数据为估算`. This legacy presentation is scheduled for replacement in Tasks 10–13 and is not a valid target-architecture publication result.

The gateway has its own environment file at `services/travel-provider-gateway/.env.example` and commands:

```bash
cd services/travel-provider-gateway
npm ci
npm run lint
npm run test
npm run build
```

The gateway exposes `GET /healthz` and authenticated `POST /v1/search`. It accepts only supported normalized requests, calls FlyAI through an argument-array CLI invocation with shell execution disabled, and returns stable error codes for no route, no ticket, rate limit, upstream unavailability, CLI failure, timeout, and invalid responses. Its 5-minute cache is process-local; supplier calls are globally serial, same-key cache misses share one in-flight request, and rate limiting has no immediate retry (5-second then 15-second global cooldown). A health response proves only that the gateway process is reachable, not supplier quota, risk-control clearance, or real-ticket availability.

For operations, the default FlyAI path writes a server-only `flyai_diagnostic` log event. It contains only a hashed `routeFingerprint`, `mode`, `outcome`, top-level/data/item field-name arrays, item/normalized/dropped counts, dropped validation categories, and `cliErrorCode`; it is not an HTTP contract, cache entry, or database record, and contains no provider text, ticket facts, city names, personal data, or secrets. Live `data.itemList` entries are validated independently, so one malformed entry does not discard adjacent real routes; only a non-empty list with no valid route returns `PROVIDER_INVALID_RESPONSE`.

Run `npm run probe:providers` only with operator-managed keys. It prints a single redacted JSON summary (status, latency, count, and field names), never provider payload values. The main app submits distinct route/mode groups serially and derives its default total budget from the group count, matching the gateway's single-supplier queue so queued successes are not replaced by estimates. It performs a deterministic second pass for genuinely unfinished groups, except that a `PROVIDER_RATE_LIMITED` mode becomes an estimate retaining that stable reason and is never immediately retried. Supplier coverage remains an operational acceptance question: use a new full plan and route-fingerprint diagnostics after cooldown, and do not treat `/healthz` or a single successful fare row as proof of supplier-wide authorization, quota recovery, or production readiness.

Future Fliggy/FlyAI MCP or skill integrations should be treated as gateway-side provider adapters, not main-app dependencies. Compare them against the same fixed route/mode probe set before replacing FlyAI or changing fallback behavior.

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
