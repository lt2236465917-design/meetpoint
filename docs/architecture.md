# Cross-City MeetPoint Architecture

This document is the stable technical map for the running system. Detailed task history lives in git commits and `docs/superpowers/plans/`.

The approved product and Multi-Agent architecture is documented separately in `docs/superpowers/specs/2026-07-15-multi-agent-recommendation-design.md`. Tasks 1–13 are implemented. The shared result renders one city and persisted saving/fast schemes, private one-city previews require requester-or-host reads plus host-only atomic replacement, and the legacy estimate/three-city/explanation-only paths are removed. Task 14 PostgreSQL/Supabase migration smoke and real supplier/device acceptance remain release blockers.

## Runtime Shape

- Next.js App Router renders the responsive H5 pages under `src/app/`; desktop viewports show the same H5 workflow in a centered phone-sized canvas.
- Route handlers under `src/app/api/` use the server-side Supabase service-role client.
- When Supabase server variables are missing, route handlers use the server-side in-memory fallback store in `src/lib/fallback/mvp-store.ts`. It preserves run states and publication guards for local smoke tests but has no supplier adapter and never publishes estimates.
- Browser-side Supabase access must use only the anon client from `src/lib/supabase/client.ts`.
- Deterministic business logic lives in `src/lib/`; route handlers orchestrate validation, persistence, and service calls.
- Amap is called only from the Next.js server-side city provider after a local city miss. The main application calls the isolated Node travel gateway at `services/travel-provider-gateway/` only from server-side calculation code.

## User-Facing Routes

| Route | Purpose |
| --- | --- |
| `/` | Focused creation entry plus browser-local recent meeting records for plans opened on this device. |
| `/create` | Host creates a plan, receives a phone-openable public link, and saves the plan to local recent records. |
| `/p/[code]` | Public plan summary, auto-refreshed participant completion state, filling records, join entry, result entry, and direct calculation for local participants once the participant limit is reached. |
| `/p/[code]/join` | Participant submits name, departure city, and accepted transport modes, then returns to the public plan page automatically. |
| `/p/[code]/manage` | Legacy route that points users back to the public plan page. |
| `/p/[code]/result` | Shows one published city and exactly saving/fast schemes from persisted scheme routes after completion; all other run states show progress, retry, or diagnostic guidance without result cards. |
| `/p/[code]/alternatives` | Lets a participant request one supported city, view private progress/result data, and hand the preview URL to the host for confirmation. |

## API Routes

| Route | Method | Purpose | Auth |
| --- | --- | --- | --- |
| `/api/plans` | `POST` | Create a plan from title, arrival date, and participant limit; return a one-time host token. | None |
| `/api/plans/[code]` | `GET` | Read public plan data and the current shared-result run, or latest automatic progress before any shared result exists. | None |
| `/api/plans/[code]/participants` | `POST` | Submit participant city and transport preferences. | None |
| `/api/plans/[code]/candidates` | `GET` | Read stored candidate-city controls. | None |
| `/api/plans/[code]/candidates` | `POST` | Currently unavailable for manual edits. | None |
| `/api/plans/[code]/calculate` | `POST` | Create an automatic run and return HTTP 202 without waiting for supplier work. | `x-participant-token` |
| `/api/plans/[code]/runs/[runId]/advance` | `POST` | Advance one bounded transition or query batch idempotently. | `x-participant-token` |
| `/api/plans/[code]/previews` | `POST` | Create a private alternative run restricted to one canonical city. | `x-participant-token` |
| `/api/plans/[code]/previews/[runId]` | `GET` | Read private progress/result data; unauthorized callers receive 404. | Requesting `x-participant-token` or `x-host-token` |
| `/api/plans/[code]/previews/[runId]/confirm` | `POST` | Confirm the exact approved proposal and atomically replace the current shared result. | `x-host-token` only |
| `/api/cities/search` | `GET` | Search local city data first, then Amap-backed city-level matches. | None |

## Data Flow

1. Host creates a row in `plans`; the public share URL is returned and the creating browser stores the plan in local recent records.
2. Participants submit rows in `participants`; each edit token is returned once and only its hash is stored. The public plan page polls `GET /api/plans/[code]` so filling records appear without a manual browser refresh.
3. Candidate controls can be read from `candidate_cities`; manual candidate editing is disabled in the current no-management-token flow.
4. After participant-token authorization, `POST /calculate` creates one `pending` automatic run and its route-task matrix, then returns HTTP 202. A duplicate active run receives `409 CALCULATION_IN_PROGRESS`. `POST /runs/[runId]/advance` owns a persisted lease in the Supabase path and performs at most one transition or bounded query batch. It accepts only verified quotes, requires at least one city with complete participant coverage, validates the deterministic saving/fast proposal, then invokes the guarded publication RPC. An automatic run cannot replace an existing shared result.
5. After a completed shared result, any participant may create an `alternative` run bound to exactly one requested city and their participant identity. The same Manager/Query/Calculation/Supervisor pipeline materializes it privately and stops at `awaiting_host_confirmation`. The requesting participant and host may read it; other participants receive 404. Only `x-host-token` can invoke the confirmation boundary, which passes the exact approved proposal and stored verified credential hash to `confirm_alternative_result`.
6. `GET /api/plans/[code]` and `/result` anchor public state to the current non-superseded shared result, so a pending private preview never hides or replaces the prior city. The result screen loads the shared `recommendation_results` row, its two `recommendation_schemes`, and each persisted `recommendation_scheme_routes` selection joined to the participant and verified quote. It renders those stored selections directly and never reselects a route in the browser.
7. Pre-migration `city_recommendations` and `travel_options` are historical read-only rows and can never be promoted into a new shared result. A pre-migration plan without a stored host credential may view its history but must create a new plan to use host confirmation.
8. The browser stores local recent meeting records in `localStorage` when a plan is created, opened, or joined. Participant records keep the participant edit token on the filling device so the public plan page can show direct calculation after the plan is full. The homepage recent-record store refreshes on same-tab updates, `storage`, `pageshow`, and window focus so plans created on another route still appear after returning to `/`. This is a convenience layer only and is not a server-side history.

In fallback mode, the same logical records are kept in process memory instead of Supabase. Tests may inject validated quotes, but the running app does not call suppliers in this mode; missing coverage ends the run as `incomplete` and no estimate or shared result is synthesized.

## External Provider Boundary

1. City search returns built-in-library results immediately. On a local miss, the server calls Amap input tips with a 3-second limit, validates the narrow response, and returns normalized prefecture-level or municipality city results. Amap failures, invalid responses, missing keys, and non-city places return no remote selectable city.
2. `POST /v1/search` accepts a normalized `departureDate` and returns real options with stable gateway-issued `quoteId` values, nullable upstream-native `providerQuoteId`, response `traceId`, and query timestamp. Stable error responses include `traceId` and nullable `retryAfterMs`; only rate-limited responses may carry a non-null retry delay.
3. `services/travel-provider-gateway/` owns FlyAI credentials and CLI execution. Its HTTP boundary is `GET /healthz` and bearer-authenticated `POST /v1/search`; requests and responses are strict Zod schemas. `/healthz` proves only process reachability, never supplier quota, risk-control clearance, or real-ticket availability.
4. The gateway uses argument-array `execFile` calls with shell execution disabled, a 12-second provider timeout, a five-minute route-facts cache, and global FIFO concurrency limited to one supplier call. Cache misses for the same normalized route key share one in-flight provider call. Timeout, unavailable, and upstream-unavailable failures retry once; a rate-limit failure never retries immediately, instead imposing a 5-second global cooldown and escalating the next cooldown to 15 seconds if the first post-cooldown supplier call is also rate limited. It classifies FlyAI CLI failures into stable no-route, no-ticket, rate-limit, upstream-unavailable, CLI-failed, timeout, unavailable, and invalid-response errors without returning raw provider output; FlyAI/Fliggy 403 risk-control rejections are treated as rate-limit failures. Only the default FlyAI path writes the server-only `flyai_diagnostic` event, containing a hashed route fingerprint, mode, outcome, field-name arrays, item counts, dropped categories, and CLI error code; it never contains provider text, ticket facts, city names, identities, or secrets and is not an HTTP, cache, or database contract. It does not receive participant identity, generate candidates, select routes, score cities, call DeepSeek, or persist plans.
5. The gateway accepts both the fixture-era normalized FlyAI rows and the live FlyAI `data.itemList` response shape. Live price strings are normalized to integer CNY values, local China-time strings are converted to offset timestamps, and `jumpUrl` is admitted only through the booking URL allowlist. Each live item is validated independently: malformed siblings are dropped with a redacted category, while a non-empty list with no valid route becomes `PROVIDER_INVALID_RESPONSE`.
6. The active Multi-Agent path runs up to `AGENT_QUERY_CONCURRENCY` logical QueryAgent workers (default `4`, clamped to `1..8`), while its physical scheduler serializes supplier work and deduplicates identical in-flight route/mode keys. Strictly validated real options become immutable `verified_quotes`; no participant identity crosses the gateway boundary. Retryable failures enter bounded cooldown/recovery, empty or terminal outcomes remain explicit, and incomplete real coverage ends the run as `incomplete` without a shared result. Production enablement still depends on supplier route coverage/quota behavior and full user-flow acceptance.
7. Any future Fliggy/FlyAI MCP integration belongs behind the travel gateway as another provider adapter. The main app should keep calling the same normalized gateway contract, and provider replacement decisions should be based on fixed route/mode probe comparisons for coverage, stable fields, booking URL safety, and error classification.

## Core Modules

| Module | Responsibility |
| --- | --- |
| `src/components/layout/ResponsiveShell.tsx` | Shared mobile-first page shell with a viewport-height H5 canvas, centered on desktop. |
| `src/components/plan/PublicPlanContent.tsx` | Client public-plan content that keeps participant status fresh by polling the read-plan API. |
| `src/components/plan/JoinParticipantForm.tsx` | Participant submission form with labeled controls and a post-submit return action. |
| `src/components/plan/RecentMeetingRecords.tsx` | Homepage local recent-record list backed by `useSyncExternalStore` and cached snapshots. |
| `src/components/result/SharedRecommendation.tsx`, `SchemeCard.tsx` | One-city/two-scheme shared result that renders persisted scheme-route rows, team totals, quote fingerprints, and China-time freshness without booking links or client-side route selection. |
| `src/components/result/RefreshingResultNotice.tsx` | Chinese progress, cooldown, retry, and diagnostic feedback for every run status with bounded refresh backoff. |
| `src/components/result/AlternativeCityFlow.tsx` | Mobile-first city search, private progress/result display, and host-only confirmation action. |
| `src/lib/city/candidate-generator.ts` | Deterministic candidate-city generation from participant cities and host controls. |
| `src/lib/city/amap-client.ts`, `src/lib/city/city-provider.ts` | Local-first city search and Amap validation; normalized city-level remote matches can become selectable inputs, while non-city remote places are discarded. |
| `src/lib/fallback/mvp-store.ts` | In-memory local fallback persistence with target run states and publication guards; tests can seed verified quotes, while the running app cannot query suppliers in this mode. |
| `src/lib/agent/run-orchestrator.ts` | Bounded durable-run state machine, persisted advance lease, quote coverage gate, agent review, and guarded publication; dispatches to the equivalent fallback state machine when Supabase is absent. |
| `src/lib/recommendation/repository.ts` | Server-side persistence and guarded RPC boundary; it does not make policy decisions. |
| `src/lib/recommendation/alternative-preview.ts`, `src/lib/security/host-confirmation.ts` | One-city alternative creation, requester/host private reads, exact approved-proposal selection, and host-token confirmation. |
| `src/lib/recommendation/policy.ts`, `validators.ts` | Deterministic one-city/saving/fast policy replay and evidence/publication validation. |
| `src/lib/travel/types.ts` | Main-app normalized gateway request contract. |
| `src/lib/travel/gateway-client.ts` | Server-only authenticated gateway client used by QueryAgent; no participant identity crosses this boundary. |
| `src/lib/travel/booking-url.ts` | Booking URL allowlist retained for validation and storage boundaries; result cards do not render booking actions. |
| `services/travel-provider-gateway/src/contracts.ts` | Strict normalized gateway request, option, response, and stable error contracts. |
| `services/travel-provider-gateway/src/flyai-adapter.ts` | Safe FlyAI CLI adapter with fixture and live `data.itemList` response normalization. |
| `services/travel-provider-gateway/src/service.ts`, `src/server.ts` | Cache/retry/concurrency orchestration and authenticated internal HTTP service. |
| `src/lib/recommendation/calculate-run.ts` | Compatibility entry that dispatches automatic run creation to Supabase or the fallback store. |
| `src/lib/ai/deepseek-client.ts` | Server-only DeepSeek client and model configuration; each SDK attempt has a 15-second timeout and at most one retry. |
| `src/lib/ui/meeting-history.ts` | Browser-local recent-record parsing, dedupe, snapshot caching, and storage helpers. |

## Agent Flow

1. Manager and Query orchestration are deterministic. After complete verified-quote coverage, Calculation and Supervisor call the provider-neutral `AgentModel`; the current provider is DeepSeek using `DEEPSEEK_MODEL` or `deepseek-v4-flash`.
2. The model receives bounded, sanitized inputs and strict closed output schemas. The DeepSeek V4 adapter explicitly requests JSON, provides format guidance, caps output at 4096 tokens, and disables thinking for deterministic structured turns. Calculation can reference only verified quote IDs; Supervisor returns an allowlisted decision/correction contract.
3. Missing credentials, unavailable models, invalid output, or two rejected proposals fail the run closed. Deterministic validators recheck quote ownership, arrival dates, totals, scheme policy, and publication state before any shared result can become visible.

## Security Boundaries

- Keep service-role Supabase access in server-side code only.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `AMAP_API_KEY`, `DEEPSEEK_API_KEY`, `TRAVEL_GATEWAY_TOKEN`, and all gateway `FLYAI_API_KEY` values out of browser code. The FlyAI key belongs only to the gateway environment.
- Participant edit tokens are stored as hashes only.
- Calculation requires a participant edit token from a participant in the plan, and the server checks that the participant limit has been reached before calculating.
- Local participant permissions are a same-device convenience and not an auth boundary; server-side calculation still verifies the participant edit token hash.
- Private previews are readable only by their requesting participant or the host. Unauthorized tokens and plan/run mismatches return the same 404 response.
- Preview confirmation accepts authority only from `x-host-token` and publishes the server-selected exact Supervisor-approved proposal; participant tokens and client-supplied proposal IDs cannot authorize or alter replacement.
- Ticket normalization, coverage checks, policy replay, evidence validation, and publication guards remain deterministic. An agent may propose only from verified quote IDs; it cannot invent or mutate supplier facts, and publication replays the policy deterministically.
- Result recommendations are plan-level shared decisions, not personalized rankings. The UI should surface team total fare and per-person route choices instead of average fare.
- Fallback mode is local-only and must not be treated as durable storage.
- Gateway logs and errors must exclude credentials, authorization headers, participant names, raw provider payloads, and complete booking URLs. Booking URLs are accepted only when HTTPS and on the approved `fliggy.com`, `alitrip.com`, or `feizhu.com` hosts (including subdomains).

## UI Boundaries

- Keep user-facing copy in Chinese on both mobile and desktop.
- Target routes must stay usable as product workflows on desktop; do not replace them with a marketing landing page.
- `ResponsiveShell` is the default page shell for the main user routes. It keeps the workflow as a single-column, viewport-height H5 canvas on mobile and desktop, with the main content scrolling inside the canvas instead of stretching into a long document page.
- Main flow pages use the `ResponsiveShell` top-left back action instead of mixing back navigation into bottom business actions.
- City combobox candidates render in normal document flow and disappear after a city is selected so transport-mode controls remain reachable.
- Next.js development indicators are disabled in `next.config.ts` so local browser checks do not show the bottom-left `N` overlay.
- `next.config.ts` allows both `127.0.0.1` for local browser testing and the local LAN development origin used for phone testing, so client-side forms keep working when opened from either URL.

## Verification

Run after code changes:

```bash
npm run lint
npm run test
npm run build
```

For the isolated gateway, run the same three commands from `services/travel-provider-gateway/`. The current Dockerfile is a Node 20 multi-stage, non-root image; it receives secrets only at runtime.

In managed sandboxes, `npm run build` can fail if Turbopack cannot create a process and bind a local port. Re-run the same command in an environment that permits local port binding before release.
