# Cross-City MeetPoint

Mobile-usable Web MVP for choosing a fair cross-city meeting city for 2-6 people in China. Shareable plan links must work on phones. Shipped UI uses a true adaptive layout (no fake phone frame): full-bleed home hero, fluid `ResponsiveShell` — [adaptive shell design](docs/superpowers/specs/2026-07-17-desktop-adaptive-shell-design.md). Without Supabase credentials, development uses a non-persistent fallback for local creation, participation, and run-progress smoke tests.

## Release Status

The Multi-Agent flow and Repository Audit Batches A–C are implemented on `main`: one city, saving/fast schemes from verified quotes, private host-confirmed alternatives, deterministic database replay, canonical departure identity, and fail-closed terminal recovery. Policy `2026-07-19.v2` defines saving as the exact lowest verified fare in each participant's direct-first accepted-mode set (including direct normal train) and keeps fast within 130% of the saving total.

The Vercel Services deployment builds the Next.js frontend and private travel-gateway container together and is operational outside mainland China. It is **not accepted as stable for the China target audience** while only `*.vercel.app` aliases exist. The primary China host is the filed Alibaba Cloud domain `https://www.meetpoint.space` (Nginx → loopback frontend on `3001`, private gateway). Compose `run-worker` is packaged on branch `codex/repository-audit-complete` @ `f53acbd` but not yet claimed live on ECS. See [mainland phone acceptance](docs/acceptance/2026-07-28-aliyun-mainland-phone-acceptance.md), [prior Vercel evidence](docs/acceptance/2026-07-27-production-release-acceptance.md), and [operator guide](docs/integration-guide.md).

The linked Supabase project has migrations through `202607280001_extend_active_run_stale_window.sql` applied (2-hour active stale; required for leave-and-finish).

## Scripts

- `npm run dev`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run worker:recommendation` — local/process entry for the Compose recommendation worker (`tsx src/worker/recommendation-run-worker.ts`); production uses the Compose `run-worker` service, not this script on the host.

## Current Flow

- `/`: full-bleed train-window home hero (zero-scroll opening) with CTA to create a plan and “最近记录” entry to `/records`.
- `/records`: browser-local recent meeting records on this device.
- `/create`: host creates a meeting plan, receives a phone-openable public link, and saves the plan to local recent records.
- `/p/[code]`: public plan page with a single StatusLane panel (status → one primary CTA → `已填写` list), automatic participant-status refresh, and a host「开始见面」action for local participants when the participant limit is reached. IA: `docs/superpowers/specs/2026-07-17-plan-result-ia-design.md`.
- `/p/[code]/join`: participant submits name, departure city, and accepted transport modes, then returns to the public plan page automatically.
- `/p/[code]/manage`: legacy route that points users back to the public plan page.
- `/p/[code]/result`: shared team result page that renders one recommended city plus exactly “省钱方案” and “省时方案” from persisted scheme routes only after completion. Pending, collecting, cooling, calculating, validating, incomplete, and failed states show bounded progress, retry, or diagnostic guidance without result cards.
- `/p/[code]/alternatives`: participant-only one-city recalculation flow. The preview stays private to its requester and the host until the host confirms replacement.
- `POST /api/plans`: creates a plan from `{ title, arrivalDate, participantLimit }` and returns `{ code, shareUrl, hostToken }`; the host token is returned once.
- `GET /api/plans/[code]`: returns public plan data and the run that owns the current shared result; before any shared result exists, it returns the latest automatic-run progress. A private preview never replaces the public projection before host confirmation.
- `GET /api/cities/search?q=...`: merges built-in hub library hits with Amap prefecture-level matches when configured (local first, deduped); returns `{ cities }`. See [2026-07-18 design](docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md).
- `POST /api/plans/[code]/participants`: creates a participant and returns `{ participantId, editToken }`.
- `GET /api/plans/[code]/candidates`: returns stored candidate city controls for a plan.
- `POST /api/plans/[code]/candidates`: currently returns `CANDIDATE_EDITING_UNAVAILABLE`.
- `POST /api/plans/[code]/calculate`: creates a bounded automatic run (`202`, `disposition: "created"`) or resumes the identical active automatic run (`200`, `disposition: "resume_existing"`); requires `x-participant-token`. Once a shared result exists, automatic creation fails with `SHARED_RESULT_EXISTS`.
- `POST /api/plans/[code]/runs/[runId]/advance`: advances at most one state transition or one bounded query batch; requires `x-participant-token`.
- `POST /api/plans/[code]/previews`: after the first shared result exists, creates a one-city alternative run from `{ cityCode, cityName }` (`202 created`) or resumes the same participant/city preview (`200 resume_existing`); requires `x-participant-token`.
- `GET /api/plans/[code]/previews/[runId]`: reads private progress and preview data only for the requesting participant or host; unauthorized callers receive 404.
- `POST /api/plans/[code]/previews/[runId]/confirm`: atomically replaces the current shared result within the seven-day confirmation window; authority comes only from `x-host-token`, expired previews return `PREVIEW_EXPIRED`, and repeated successful confirmation is idempotent.

## Core Modules

- `src/lib/city/candidate-generator.ts`: deterministic candidate-city generation from participant cities and host controls.
- `src/lib/city/amap-client.ts` and `src/lib/city/city-provider.ts`: local-first city search with canonical Amap administrative-district lookup, a 5-second timeout, one bounded retry, and a server-memory China city index fallback for prefecture-level departures.
- `src/lib/fallback/mvp-store.ts`: server-side in-memory fallback store that preserves the target run states and publication guards for local tests; it never synthesizes estimates or calls suppliers.
- `src/lib/travel/types.ts`: strict main-app request contract for the isolated travel gateway.
- `src/lib/travel/gateway-client.ts`: server-side authenticated gateway client used by QueryAgent to persist verified quotes without participant identity crossing the gateway boundary.
- `services/travel-provider-gateway/`: independently runnable FlyAI gateway with strict contracts, safe CLI execution, cache, concurrency limit, retry, authenticated HTTP API, and container configuration.
- `src/lib/recommendation/policy.ts` and `validators.ts`: deterministic direct-first saving/fast schemes, unique-city ranking, evidence replay, and bounded policy evaluation.
- `src/lib/recommendation/repository.ts`: durable run persistence and guarded result materialization. A gateway `quoteId` may repeat when multiple participants share a physical route, so selected evidence is resolved by participant plus quote ID rather than a global quote-ID lookup.
- `src/lib/agent/`: provider-neutral model boundary plus Manager, Query, Calculation, Supervisor, Fallback, tracing, and bounded orchestration modules.
- `src/lib/agent/run-orchestrator.ts`: creates and incrementally advances durable runs with a persisted lease and rolling **2-hour** inactivity deadline; one exhausted route becomes terminal while other healthy route tasks continue. It dispatches to the guarded in-memory fallback when Supabase is absent.
- `src/lib/recommendation/run-worker.ts` and `src/worker/recommendation-run-worker.ts`: Compose `run-worker` selection/tick loop and process entry (independent heartbeat); live on ECS; leave-and-finish checklist #11 PASS (2026-07-28).
- `src/lib/recommendation/alternative-preview.ts` and `src/lib/security/host-confirmation.ts`: bind a private run to one canonical city and requesting participant, authorize private reads, and pass the exact Supervisor-approved proposal to host-only atomic confirmation.
- `src/components/result/SharedRecommendation.tsx` and `SchemeCard.tsx`: render the published city once and map persisted participant routes directly on `.atmosphere-panel` glass (no nested white route cards), including team totals, route facts, quote fingerprints, and China-time freshness; they never render booking links or client-side route selection.
- `src/components/result/RefreshingResultNotice.tsx`: maps every run status to Chinese progress/retry guidance. Leave-friendly copy (users can leave); optional bounded authenticated advance; terminal `incomplete` / `failed` create a fresh automatic run when the device still holds a participant token.
- `src/components/home/HomeHero.tsx`: product `/` full-bleed train-window hero (brand `meetpoint`, train overlay, glass CTA to `/create`, entry to `/records`). It continuously cycles all four scenic clips, uses a near-end guard when a browser misses `ended`, and still supports manual scene selection.
- `src/components/layout/FunctionalScenicBackdrop.tsx`, `ShellScenicBackdrop.tsx`, `ResponsiveShell.tsx`, and `src/app/globals.css`: one root-mounted route-fixed clip stays alive through functional-page loading/navigation, with playback checkpoints after unavoidable remounts; a transient media error falls through to the static fallback without permanently hiding a recovered video. `ResponsiveShell` renders adaptive `max-w-2xl` content above it.
- `src/components/result/PeakScenicAccent.tsx` + `src/lib/ui/scenic-videos.ts`: transparent wait/reveal glass over the single route-fixed scene, plus the same-origin desktop/mobile scenic source catalog. `PeakScenicAccent` does not mount another video.
- `src/lib/ui/meeting-history.ts`: browser-only local recent-record storage; it caches `useSyncExternalStore` snapshots so the records page does not trigger React update loops.

## Environment

Copy `.env.example` to `.env.local` and fill server-side keys locally for persistent Supabase-backed runs.

If `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing, the app uses the in-memory fallback store. It is only for local smoke testing, is cleared when the server restarts, and cannot obtain supplier quotes; an unseeded fallback run therefore ends as `incomplete` rather than publishing estimates.

For local browser testing, use `http://127.0.0.1:<port>`; for mobile-device testing, use the current Network URL printed by `npm run dev`. `next.config.ts` discovers active non-internal IPv4 addresses at server start instead of retaining a historical Wi-Fi address, so Next.js client resources and interactive forms load after network changes.

Supabase variables:

- `NEXT_PUBLIC_SUPABASE_URL`: public Supabase project URL used by browser and server clients.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: public Supabase client bootstrap key; browser roles have no direct business-table or Realtime read path.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only service-role key for route handlers and background calculations.
- `AMAP_API_KEY`: server-side Amap key for local-miss city validation; normalized city-level results can be selected even when they are absent from the built-in city library.
- `DEEPSEEK_API_KEY`: server-side DeepSeek key for the provider-neutral Calculation/Supervisor model.
- `DEEPSEEK_MODEL`: optional server-side model override; defaults to `deepseek-v4-flash`.
- `FLYAI_PROBE_CLI_PATH`: optional operator-only executable override for the redacted FlyAI capability probe.
- `PROBE_TRAVEL_DATE`: optional `YYYY-MM-DD` travel date for the operator-only provider probe; defaults to the next UTC date.
- `PROBE_FLYAI_SORT_TYPE`: optional operator-only FlyAI probe sort (`3` price ascending, default; `8` direct first); it never changes production gateway queries.
- `TRAVEL_GATEWAY_URL`: server-side internal gateway URL used by the main-app travel provider.
- `TRAVEL_GATEWAY_TOKEN`: server-side bearer token for the internal gateway.
- `TRAVEL_GATEWAY_TIMEOUT_MS`: optional main-app gateway request timeout; defaults to `30000` ms.
- `AGENT_QUERY_CONCURRENCY`: optional logical QueryAgent worker count, clamped to `1..8`; defaults to `4` and does not change the gateway's physical supplier concurrency.

The provider-neutral `AgentModel` uses DeepSeek for Calculation and Supervisor when Supabase-backed runs reach complete real-quote coverage. Calculation proposes one city and its saving/fast routes from verified candidate facts; independent deterministic policy replay rejects incorrect city selection, routes, totals, or comparison evidence before Supervisor approval or publication. The adapter makes DeepSeek V4 JSON mode explicit, supplies format guidance, bounds output to 4096 tokens, and disables thinking for these structured turns. Missing, truncated, altered, or invalid model output fails closed and cannot publish; deterministic policy replay and publication guards remain authoritative.

For local real-ticket smoke tests, run the gateway separately and set `TRAVEL_GATEWAY_URL=http://127.0.0.1:8080` in `.env.local`. The `.env.local` `TRAVEL_GATEWAY_TOKEN` must match `services/travel-provider-gateway/.env`; otherwise QueryAgent records the gateway failure and the run cannot publish without complete verified coverage.

## Travel Provider Status

Tasks 1-10 of the historical [Amap and FlyAI implementation plan](docs/superpowers/plans/2026-07-12-amap-flyai-integration.md) are complete: Amap city validation, travel query freshness persistence, the isolated gateway, and its authenticated client are fixture-verified. The active Multi-Agent path persists only validated real options as verified quotes; retryable failures receive bounded recovery, and incomplete coverage publishes nothing.

The shared result never promotes pre-migration `city_recommendations` or `travel_options`: those rows are historical read-only data. New publication loads guarded `recommendation_results`, `recommendation_schemes`, and selected verified-quote routes, then renders one city with saving and fast schemes. A pre-migration plan without a stored host credential may still view historical data but must create a new plan to use host-confirmed alternatives.

The gateway has its own environment file at `services/travel-provider-gateway/.env.example` and commands:

```bash
cd services/travel-provider-gateway
npm ci
npm run lint
npm run test
npm run build
```

The gateway exposes `GET /healthz` and authenticated `POST /v1/search`. It accepts only supported normalized requests, calls FlyAI through an argument-array CLI invocation with shell execution disabled, and returns stable error codes for no route, no ticket, rate limit, upstream unavailability, CLI failure, timeout, and invalid responses. Its 5-minute cache is process-local; supplier calls are globally serial, same-key cache misses share one in-flight request, and rate limiting has no immediate retry (5-second then 15-second global cooldown). A health response proves only that the gateway process is reachable, not supplier quota, risk-control clearance, or real-ticket availability.

For operations, the default FlyAI path writes a server-only `flyai_diagnostic` log event. Its fixed allowlist is `routeFingerprint`, `mode`, `outcome`, `itemCount`, `normalizedCount`, `droppedCount`, `droppedReasons`, and `cliErrorCode`; it is not an HTTP contract, cache entry, or database record, and contains no supplier key names, provider text, ticket facts, city names, personal data, or secrets. Live `data.itemList` entries are validated independently, so one malformed entry does not discard adjacent real routes; only a non-empty list with no valid route returns `PROVIDER_INVALID_RESPONSE`. Connecting itineraries normalize the complete ordered segment set and reject invalid sequence, over-eight-segment, or mixed-mode evidence. Live prices accept `ticketPrice`, `price`, or documented `adultPrice`, including currency-prefixed numeric strings.

Run `npm run probe:providers` only with operator-managed keys exported from root `.env.local` and `services/travel-provider-gateway/.env`; keep `FLYAI_API_KEY` in the gateway file rather than copying it into root configuration. `PROBE_TRAVEL_DATE` optionally fixes the probe date, and `PROBE_FLYAI_SORT_TYPE=3|8` compares price-first with direct-first ordering without changing production. The probe leaves journey type unfiltered and prints one redacted JSON summary with status, latency, field names, and total/direct/connecting/unclassified counts, never provider payload values. The active QueryAgent keeps route/mode work bounded and never replaces missing verified quotes with estimates. Supplier coverage remains an operational acceptance question: use a new full plan and route-fingerprint diagnostics after cooldown, and do not treat `/healthz` or a single successful fare row as proof of supplier-wide authorization, quota recovery, or production readiness.

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

For UI changes, also verify a mobile viewport around `390x844` and a desktop viewport around `1440x1000`: no fake phone chrome; usable adaptive width; home opening zero-scroll; records on `/records` — see the adaptive-shell spec.

## Manual Handoff Smoke

After the automated verification above, run this browser smoke for Task 14:

1. Create a plan.
2. Open `/records` and confirm the created plan appears in recent meeting records on the same device.
3. Open the public link.
4. Submit two participants from different cities.
5. Confirm the public plan page updates filling records without a manual browser refresh.
6. After the participant limit is reached, start calculation from the public plan page on a device that has filled the plan.
7. Confirm the calculate request returns `202 created` for a new run or `200 resume_existing` for the identical active run, and the progress route is reachable with the participant token.
8. Do not use local fallback to claim a published target result: it has no supplier adapter and will finish as `incomplete` without injected verified quotes. Consult the canonical acceptance record for current Task 14 evidence and blockers.
9. With a completed fixture or Supabase-backed run, confirm `/p/[code]/result` shows the city once, exactly “省钱方案” and “省时方案”, every participant route, quote freshness in China time, and no estimate, average-fare, three-city, or booking-link UI.
10. From a completed result, open “换个城市看看”, select one supported city, and confirm the requester sees “仅你可见的预览” while the shared result remains unchanged.
11. Open the preview URL in the host browser, confirm “确认替换共享结果” appears only there, then confirm once; the shared result should show the replacement city. Repeated idempotent confirmation is covered by API/RPC tests rather than a second physical UI request in Task 14 acceptance.
