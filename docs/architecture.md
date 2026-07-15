# Cross-City MeetPoint Architecture

This document is the stable technical map for the running system. Detailed task history lives in git commits and `docs/superpowers/plans/`.

The approved next product and Multi-Agent architecture is documented separately in `docs/superpowers/specs/2026-07-15-multi-agent-recommendation-design.md`. Tasks 1–9 are implemented but Task 9 is awaiting independent review, and Tasks 10–14 remain. The Supabase path below is the target-in-progress; the local fallback and result UI still contain legacy MVP behavior and cannot validate target-architecture publication.

## Runtime Shape

- Next.js App Router renders the responsive H5 pages under `src/app/`; desktop viewports show the same H5 workflow in a centered phone-sized canvas.
- Route handlers under `src/app/api/` use the server-side Supabase service-role client.
- When Supabase server variables are missing, route handlers use the server-side in-memory fallback store in `src/lib/fallback/mvp-store.ts` so the local create-to-result MVP can be smoke-tested without external credentials.
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
| `/p/[code]/result` | Shows the latest shared team recommendation run, stale-result warning, team total fare, total duration, fairness gap, and per-participant travel details. |

## API Routes

| Route | Method | Purpose | Auth |
| --- | --- | --- | --- |
| `/api/plans` | `POST` | Create a plan from title, arrival date, and participant limit; return a one-time host token. | None |
| `/api/plans/[code]` | `GET` | Read public plan data, progress, and a shared result only after completion. | None |
| `/api/plans/[code]/participants` | `POST` | Submit participant city and transport preferences. | None |
| `/api/plans/[code]/candidates` | `GET` | Read stored candidate-city controls. | None |
| `/api/plans/[code]/candidates` | `POST` | Currently unavailable for manual edits. | None |
| `/api/plans/[code]/calculate` | `POST` | Create an automatic run and return HTTP 202 without waiting for supplier work. | `x-participant-token` |
| `/api/plans/[code]/runs/[runId]/advance` | `POST` | Advance one bounded transition or query batch idempotently. | `x-participant-token` |
| `/api/plans/[code]/explain` | `POST` | Regenerate explanations for the latest recommendation run. | None |
| `/api/cities/search` | `GET` | Search local city data first, then Amap-backed city-level matches. | None |

## Data Flow

1. Host creates a row in `plans`; the public share URL is returned and the creating browser stores the plan in local recent records.
2. Participants submit rows in `participants`; each edit token is returned once and only its hash is stored. The public plan page polls `GET /api/plans/[code]` so filling records appear without a manual browser refresh.
3. Candidate controls can be read from `candidate_cities`; manual candidate editing is disabled in the current no-management-token flow.
4. Manual calculation generates candidate cities, queries the travel provider boundary, scores each candidate city from one selected route per participant, and writes:
   - `recommendation_runs`
   - `travel_options`
   - `city_recommendations`, including DeepSeek/fallback explanation fields
   After participant-token authorization, only one `running` run may exist for a plan. A duplicate request receives `409 CALCULATION_IN_PROGRESS` and does not start another ticket lookup.
5. The explain API can regenerate explanation and risk-summary fields for the latest run without changing deterministic scores.
6. Result pages read the latest run, city recommendations, and matching `travel_options`. A `running` run is an in-progress state: the public page withholds the result entry and the result page reports progress with bounded local refresh plus a manual refresh action. Only a `completed` run renders recommendation cards. Every viewer then sees the same shared city ranking for the plan; each card expands the decision with selected per-participant routes. Results become stale after 30 minutes.
7. The browser stores local recent meeting records in `localStorage` when a plan is created, opened, or joined. Participant records keep the participant edit token on the filling device so the public plan page can show direct calculation after the plan is full. The homepage recent-record store refreshes on same-tab updates, `storage`, `pageshow`, and window focus so plans created on another route still appear after returning to `/`. This is a convenience layer only and is not a server-side history.

In fallback mode, the same logical records are kept in process memory instead of Supabase. Fallback mode is non-persistent and exists only for local smoke testing.

## External Provider Boundary

1. City search returns built-in-library results immediately. On a local miss, the server calls Amap input tips with a 3-second limit, validates the narrow response, and returns normalized prefecture-level or municipality city results. Amap failures, invalid responses, missing keys, and non-city places return no remote selectable city.
2. `TravelOption.queriedAt` is nullable. Real gateway prices carry the gateway query timestamp; deterministic estimates and unavailable options use `null`. Supabase persists this as `travel_options.queried_at`.
3. `services/travel-provider-gateway/` owns FlyAI credentials and CLI execution. Its HTTP boundary is `GET /healthz` and bearer-authenticated `POST /v1/search`; requests and responses are strict Zod schemas. `/healthz` proves only process reachability, never supplier quota, risk-control clearance, or real-ticket availability.
4. The gateway uses argument-array `execFile` calls with shell execution disabled, a 12-second provider timeout, a five-minute route-facts cache, and global FIFO concurrency limited to one supplier call. Cache misses for the same normalized route key share one in-flight provider call. Timeout, unavailable, and upstream-unavailable failures retry once; a rate-limit failure never retries immediately, instead imposing a 5-second global cooldown and escalating the next cooldown to 15 seconds if the first post-cooldown supplier call is also rate limited. It classifies FlyAI CLI failures into stable no-route, no-ticket, rate-limit, upstream-unavailable, CLI-failed, timeout, unavailable, and invalid-response errors without returning raw provider output; FlyAI/Fliggy 403 risk-control rejections are treated as rate-limit failures. Only the default FlyAI path writes the server-only `flyai_diagnostic` event, containing a hashed route fingerprint, mode, outcome, field-name arrays, item counts, dropped categories, and CLI error code; it never contains provider text, ticket facts, city names, identities, or secrets and is not an HTTP, cache, or database contract. It does not receive participant identity, generate candidates, select routes, score cities, call DeepSeek, or persist plans.
5. The gateway accepts both the fixture-era normalized FlyAI rows and the live FlyAI `data.itemList` response shape. Live price strings are normalized to integer CNY values, local China-time strings are converted to offset timestamps, and `jumpUrl` is admitted only through the booking URL allowlist. Each live item is validated independently: malformed siblings are dropped with a redacted category, while a non-empty list with no valid route becomes `PROVIDER_INVALID_RESPONSE`.
6. The main application sends one authenticated JSON request per distinct accepted mode. It submits route/mode groups serially to match the gateway's single-supplier FIFO and, unless `TRAVEL_CALCULATION_TIMEOUT_MS` explicitly overrides the policy, gives the collection a 25-second budget per group with a 45-second minimum. This prevents valid responses waiting in the serial queue from being discarded as generic estimates. Route groups genuinely unfinished within that calculated budget receive one second-pass lookup before estimates are used, except that `PROVIDER_RATE_LIMITED` never receives an immediate same-mode retry. The app strictly validates responses, maps facts to the participant only after the gateway response, deterministically orders valid route facts before scoring, and keeps per-mode failures as estimates. When the gateway returns a stable provider error code, such as `PROVIDER_RATE_LIMITED`, the estimated fallback row preserves that code in `failureReason` and persists it as `travel_options.failure_reason`; result cards surface the same reason beside the estimated source label. Result cards show real route details without rendering provider booking links; production enablement still depends on supplier route coverage/quota behavior and full user-flow acceptance.
7. Any future Fliggy/FlyAI MCP integration belongs behind the travel gateway as another provider adapter. The main app should keep calling the same normalized gateway contract, and provider replacement decisions should be based on fixed route/mode probe comparisons for coverage, stable fields, booking URL safety, and error classification.

## Core Modules

| Module | Responsibility |
| --- | --- |
| `src/components/layout/ResponsiveShell.tsx` | Shared mobile-first page shell with a viewport-height H5 canvas, centered on desktop. |
| `src/components/plan/PublicPlanContent.tsx` | Client public-plan content that keeps participant status fresh by polling the read-plan API. |
| `src/components/plan/JoinParticipantForm.tsx` | Participant submission form with labeled controls and a post-submit return action. |
| `src/components/plan/RecentMeetingRecords.tsx` | Homepage local recent-record list backed by `useSyncExternalStore` and cached snapshots. |
| `src/lib/city/candidate-generator.ts` | Deterministic candidate-city generation from participant cities and host controls. |
| `src/lib/city/amap-client.ts`, `src/lib/city/city-provider.ts` | Local-first city search and Amap validation; city-level remote matches can be selected, while non-city remote places never enter scoring. |
| `src/lib/fallback/mvp-store.ts` | In-memory local fallback persistence for create-to-result smoke testing without Supabase credentials. |
| `src/lib/travel/types.ts` | Vendor-neutral travel-provider interface plus main-app gateway request/response types. |
| `src/lib/travel/estimate-provider.ts` | Deterministic estimated option fallback. |
| `src/lib/travel/gateway-client.ts`, `src/lib/travel/flyai-provider.ts` | Server-only authenticated gateway client and per-mode fallback provider; no participant identity crosses this boundary. |
| `src/lib/travel/booking-url.ts` | Booking URL allowlist retained for validation and storage boundaries; result cards do not render booking actions. |
| `services/travel-provider-gateway/src/contracts.ts` | Strict normalized gateway request, option, response, and stable error contracts. |
| `services/travel-provider-gateway/src/flyai-adapter.ts` | Safe FlyAI CLI adapter with fixture and live `data.itemList` response normalization. |
| `services/travel-provider-gateway/src/service.ts`, `src/server.ts` | Cache/retry/concurrency orchestration and authenticated internal HTTP service. |
| `src/lib/recommendation/scoring.ts` | Deterministic scoring and primary recommendation selection from one selected route per participant for each candidate city. |
| `src/lib/recommendation/calculate-run.ts` | Calculation orchestration, explanation generation, and Supabase persistence. |
| `src/lib/ai/deepseek-client.ts` | Server-only DeepSeek client and model configuration; each SDK attempt has a 15-second timeout and at most one retry. |
| `src/lib/ai/recommendation-explainer.ts` | Strict Chinese JSON prompt, validation, and deterministic fallback for recommendation explanations. |
| `src/lib/ui/meeting-history.ts` | Browser-local recent-record parsing, dedupe, snapshot caching, and storage helpers. |

## AI Explanation Flow

1. Calculation or `POST /api/plans/[code]/explain` passes an already-computed `CityRecommendation` to `explainRecommendation`.
2. The server-only client uses `DEEPSEEK_MODEL` or defaults to `deepseek-v4-flash`; each request attempt times out after 15 seconds and the SDK retries at most once.
3. DeepSeek is asked for a JSON object containing exactly `short_reason`, `risk_badges`, `share_summary`, and `detail_explanation`.
4. Zod rejects unknown fields, blank values, and prose or badge values without a Han character.
5. Missing credentials, request errors or timeouts, empty content, malformed JSON, and schema-invalid output all return deterministic fallback copy.
6. Only explanation-related fields may be persisted; tickets, candidates, scores, and recommendation ordering remain unchanged.

## Security Boundaries

- Keep service-role Supabase access in server-side code only.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `AMAP_API_KEY`, `DEEPSEEK_API_KEY`, `TRAVEL_GATEWAY_TOKEN`, and all gateway `FLYAI_API_KEY` values out of browser code. The FlyAI key belongs only to the gateway environment.
- Participant edit tokens are stored as hashes only.
- Calculation requires a participant edit token from a participant in the plan, and the server checks that the participant limit has been reached before calculating.
- Local participant permissions are a same-device convenience and not an auth boundary; server-side calculation still verifies the participant edit token hash.
- Core ranking, ticket lookup normalization, and scoring must remain deterministic; DeepSeek may explain computed results but must not decide rankings.
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
