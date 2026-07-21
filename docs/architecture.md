# Cross-City MeetPoint Architecture

This document is the stable technical map for the running system. Detailed task history lives in git commits and `docs/superpowers/plans/`.

The approved product and Multi-Agent architecture is documented separately in `docs/superpowers/specs/2026-07-15-multi-agent-recommendation-design.md`. Tasks 1–14 are complete: one city with persisted saving/fast schemes, private requester-or-host previews with host-only atomic replacement, and no estimate/three-city/explanation-only paths. Canonical acceptance evidence and non-blocking residual hygiene: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`.

## Runtime Shape

- Next.js App Router renders user-facing pages under `src/app/`. Shipped presentation: adaptive layout without fake phone chrome — full-bleed `/`, `ResponsiveShell` with fluid `max-w-2xl` content width (`docs/superpowers/specs/2026-07-17-desktop-adaptive-shell-design.md`).
- Route handlers under `src/app/api/` use the server-side Supabase service-role client.
- When Supabase server variables are missing, route handlers use the server-side in-memory fallback store in `src/lib/fallback/mvp-store.ts`. It preserves run states and publication guards for local smoke tests but has no supplier adapter and never publishes estimates.
- Browser-side Supabase access must use only the anon client from `src/lib/supabase/client.ts`.
- Deterministic business logic lives in `src/lib/`; route handlers orchestrate validation, persistence, and service calls.
- Amap is called only from the Next.js server-side city provider after a local city miss. The main application calls the isolated Node travel gateway at `services/travel-provider-gateway/` only from server-side calculation code.

## User-Facing Routes

| Route | Purpose |
| --- | --- |
| `/` | Full-bleed train-window home hero (`HomeHero`, brand `meetpoint`): zero-scroll opening, CTA to `/create`, “最近记录” entry to `/records`. |
| `/records` | Browser-local recent meeting records (`RecentMeetingRecords`) in `ResponsiveShell`. |
| `/create` | Host creates a plan, receives a phone-openable public link, and saves the plan to local recent records. |
| `/p/[code]` | Public plan StatusLane (status, one primary CTA, `已填写` list), auto-refreshed participant completion, join/calculate/result entry, and direct calculation for local participants once the participant limit is reached. |
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
| `/api/cities/search` | `GET` | Merge local hub hits with Amap-backed prefecture-level matches for departure search. | None |

## Data Flow

1. Host creates a row in `plans`; the public share URL is returned and the creating browser stores the plan in local recent records.
2. Participants submit rows in `participants`; each edit token is returned once and only its hash is stored. The public plan page polls `GET /api/plans/[code]` so filling records appear without a manual browser refresh.
3. Candidate controls can be read from `candidate_cities`; manual candidate editing is disabled in the current no-management-token flow.
4. After participant-token authorization, `POST /calculate` creates one `pending` automatic run and its route-task matrix, then returns HTTP 202. A duplicate active run receives `409 CALCULATION_IN_PROGRESS`. `POST /runs/[runId]/advance` owns a persisted lease in the Supabase path and performs at most one transition or bounded query batch. It accepts only verified quotes and requires at least one city with complete participant coverage. Policy `2026-07-19.v2` selects each saving route as the exact lowest verified fare inside the direct-first accepted-mode set (including direct normal train); fast selects the quickest direct-first team combination within 130% of that saving total. The guarded publication RPC replays the policy. During materialization, gateway `quoteId` values are physical evidence identifiers that may repeat across participants sharing a route; each selected row is therefore resolved from that participant's verified quotes by `(participantId, quoteId)`. An automatic run cannot replace an existing shared result.
5. After a completed shared result, any participant may create an `alternative` run bound to exactly one requested city and their participant identity. The same Manager/Query/Calculation/Supervisor pipeline materializes it privately and stops at `awaiting_host_confirmation`. The requesting participant and host may read it; other participants receive 404. Only `x-host-token` can invoke the confirmation boundary, which passes the exact approved proposal and stored verified credential hash to `confirm_alternative_result`.
6. `GET /api/plans/[code]` and `/result` anchor public state to the current non-superseded shared result, so a pending private preview never hides or replaces the prior city. The result screen loads the shared `recommendation_results` row, its two `recommendation_schemes`, and each persisted `recommendation_scheme_routes` selection joined to the participant and verified quote. It renders those stored selections directly and never reselects a route in the browser. While a nonterminal automatic run is shown, `RefreshingResultNotice` posts one bounded authenticated advance using the device's cached participant edit token before refreshing. For terminal `incomplete` / `failed`, the same credential creates a new automatic run through `POST /calculate`; without it, the UI returns the user to the public plan instead of offering a no-op retry.
7. Pre-migration `city_recommendations` and `travel_options` are historical read-only rows and can never be promoted into a new shared result. A pre-migration plan without a stored host credential may view its history but must create a new plan to use host confirmation.
8. The browser stores local recent meeting records in `localStorage` when a plan is created, opened, or joined. Participant records keep the participant edit token on the filling device so the public plan page can show direct calculation after the plan is full. The `/records` recent-record store refreshes on same-tab updates, `storage`, `pageshow`, and window focus so plans created on another route still appear after opening `/records`. This is a convenience layer only and is not a server-side history.

In fallback mode, the same logical records are kept in process memory instead of Supabase. Tests may inject validated quotes, but the running app does not call suppliers in this mode; missing coverage ends the run as `incomplete` and no estimate or shared result is synthesized.

## External Provider Boundary

1. City search merges built-in hub hits with canonical Amap administrative-district results: local matches first, then normalized prefecture-level, province-administered-city, or municipality rows (deduped). The remote lookup has a 5-second timeout and one bounded retry; a server-memory index loaded from the Amap China administrative tree provides fallback coverage. Input tips may enrich province labels but never supply the canonical city adcode. Amap failures, invalid responses, missing keys, and non-city places omit remote rows without blocking local hits.
2. `POST /v1/search` accepts a normalized `departureDate` and returns real options with stable gateway-issued `quoteId` values, nullable upstream-native `providerQuoteId`, response `traceId`, and query timestamp. Stable error responses include `traceId` and nullable `retryAfterMs`; only rate-limited responses may carry a non-null retry delay.
3. `services/travel-provider-gateway/` owns FlyAI credentials and CLI execution. Its HTTP boundary is `GET /healthz` and bearer-authenticated `POST /v1/search`; requests and responses are strict Zod schemas. `/healthz` proves only process reachability, never supplier quota, risk-control clearance, or real-ticket availability.
4. The gateway uses argument-array `execFile` calls with shell execution disabled, a 12-second provider timeout, a five-minute route-facts cache, and global FIFO concurrency limited to one supplier call. Cache misses for the same normalized route key share one in-flight provider call. Timeout, unavailable, and upstream-unavailable failures retry once; a rate-limit failure never retries immediately, instead imposing a 5-second global cooldown and escalating the next cooldown to 15 seconds if the first post-cooldown supplier call is also rate limited. It classifies FlyAI CLI failures into stable no-route, no-ticket, rate-limit, upstream-unavailable, CLI-failed, timeout, unavailable, and invalid-response errors without returning raw provider output; FlyAI/Fliggy 403 risk-control rejections are treated as rate-limit failures. Only the default FlyAI path writes the server-only `flyai_diagnostic` event, with the fixed allowlisted fields `routeFingerprint`, `mode`, `outcome`, `itemCount`, `normalizedCount`, `droppedCount`, `droppedReasons`, and `cliErrorCode`; supplier key names are not recorded. The event never contains provider text, ticket facts, city names, identities, or secrets and is not an HTTP, cache, or database contract. The gateway does not receive participant identity, generate candidates, select routes, score cities, call DeepSeek, or persist plans.
5. The gateway accepts both the fixture-era normalized FlyAI rows and the live FlyAI `data.itemList` response shape. Live `ticketPrice`, `price`, and documented `adultPrice` strings (including currency-prefixed values) are normalized to integer CNY values, local China-time strings are converted to offset timestamps, and `jumpUrl` is admitted only through the booking URL allowlist. Each live item is validated independently: malformed siblings are dropped with a redacted category, while a non-empty list with no valid route becomes `PROVIDER_INVALID_RESPONSE`.
6. The active Multi-Agent path runs up to `AGENT_QUERY_CONCURRENCY` logical QueryAgent workers (default `4`, clamped to `1..8`), while its physical scheduler serializes supplier work and deduplicates identical in-flight route/mode keys. Strictly validated real options become immutable `verified_quotes`; no participant identity crosses the gateway boundary. Retryable failures enter bounded cooldown/recovery, empty or terminal outcomes remain explicit, and incomplete real coverage ends the run as `incomplete` without a shared result. Production enablement still depends on supplier route coverage/quota behavior and full user-flow acceptance.
7. Any future Fliggy/FlyAI MCP integration belongs behind the travel gateway as another provider adapter. The main app should keep calling the same normalized gateway contract, and provider replacement decisions should be based on fixed route/mode probe comparisons for coverage, stable fields, booking URL safety, and error classification.

## Core Modules

| Module | Responsibility |
| --- | --- |
| `src/components/home/HomeHero.tsx` | Product `/` train-window hero: brand `meetpoint`, scenic video (`pointer-events: none`), train overlay, glass CTA to `/create`. Scene index starts at `0` for hydration, then restores `meetpoint:scenic-scene` after mount. It cycles all four scenes with both `ended` and a near-end guard while only the active scene preloads. |
| `src/lib/ui/scenic-videos.ts` | Same-origin scenic catalog with original high-quality desktop MP4s and separate 1920×1080 mobile encodes selected up to 767 px. |
| `src/lib/ui/scenic-preference.ts` | Read/write the home-only `meetpoint:scenic-scene` preference without SSR `useState(localStorage)`; functional routes use pathname-fixed scenes instead. |
| `src/components/layout/FunctionalScenicBackdrop.tsx` | Root-mounted pathname-to-scene layer. It stays outside page/loading trees so same-scene navigation and result refresh preserve the video DOM and playback. |
| `src/components/layout/ShellScenicBackdrop.tsx` | One explicit route-fixed muted shell video + readable dark scrim (`pointer-events: none`); reduced motion falls back to a deepened canvas, autoplay retries on the first user gesture, and per-scene checkpoints recover unavoidable remounts. A media error reveals the fallback without installing a persistent inline hide style. |
| `src/components/layout/ScenicVideoDiagnostics.tsx` | Opt-in browser diagnostics at `?videoDebug=1`; reports codec support, network/media state, the active source, and a manual playback action without exposing the panel in normal use. |
| `src/components/result/PeakScenicAccent.tsx` | Transparent glass for wait/reveal peaks that reveals the route-fixed shell scene; it mounts no nested scenic media. |
| `src/components/layout/ResponsiveShell.tsx` | Shared transparent content shell above the root scenic layer: `.atmosphere-*` glass back/header/footer; used by all functional routes. Fluid adaptive `max-w-2xl` content width — no fake phone chrome. |
| `src/app/globals.css` | Home hero tokens (`.readable-*`, `.hero-cta`, `.scenic-fallback`) plus shared atmosphere tokens (`.atmosphere-shell/canvas/panel/field/cta/ghost/notice`, `.font-display` / `.font-sans-sc`). |
| `src/components/plan/PublicPlanContent.tsx` | Client public-plan content that keeps participant status fresh by polling the read-plan API. Single StatusLane `.atmosphere-panel`: status band + one state-driven primary CTA + light `已填写` list (no footer status echo); see `docs/superpowers/specs/2026-07-17-plan-result-ia-design.md`. |
| `src/components/plan/JoinParticipantForm.tsx` | Participant submission form with labeled controls and a post-submit return action. |
| `src/components/plan/RecentMeetingRecords.tsx` | `/records` local recent-record list backed by `useSyncExternalStore` and cached snapshots. |
| `src/components/result/SharedRecommendation.tsx`, `SchemeCard.tsx` | One-city/two-scheme shared result that renders persisted scheme-route rows, team totals, quote fingerprints, and China-time freshness without booking links or client-side route selection. City reveal uses `PeakScenicAccent`; schemes use `.atmosphere-panel` glass on the dark shell; route rows use hairline separators (no nested white cards). |
| `src/components/result/RefreshingResultNotice.tsx` | Chinese progress, cooldown, retry, and diagnostic feedback with atmosphere ghost/muted chrome. Nonterminal automatic runs can post one bounded authenticated advance; terminal `incomplete` / `failed` can create a fresh run with the local participant token, otherwise they guide the user back to the public plan. |
| `src/components/result/AlternativeCityFlow.tsx` | Mobile-first city search, private progress/result display, and host-only confirmation action. |
| `src/lib/city/candidate-generator.ts` | Deterministic candidate-city generation from participant cities and host controls. |
| `src/lib/city/amap-client.ts`, `src/lib/city/city-provider.ts` | Merged local hub + Amap prefecture results for selectable **departure** cities; non-city remote places discarded. Meeting candidates stay the hub `CITIES` library (`2026-07-18-inner-atmosphere-meetup-copy-design.md`). |
| `src/lib/fallback/mvp-store.ts` | In-memory local fallback persistence with target run states and publication guards; tests can seed verified quotes, while the running app cannot query suppliers in this mode. |
| `src/lib/agent/run-orchestrator.ts` | Bounded durable-run state machine, persisted advance lease, quote coverage gate, agent review, and guarded publication; dispatches to the equivalent fallback state machine when Supabase is absent. |
| `src/lib/recommendation/repository.ts` | Server-side persistence and guarded RPC boundary; it does not make policy decisions. Selected evidence is joined by participant plus quote ID so participants sharing one physical supplier route cannot overwrite each other's verified rows. |
| `src/lib/recommendation/alternative-preview.ts`, `src/lib/security/host-confirmation.ts` | One-city alternative creation, requester/host private reads, exact approved-proposal selection, and host-token confirmation. |
| `src/lib/recommendation/policy.ts`, `validators.ts` | Deterministic one-city/saving/fast policy replay and evidence/publication validation. |
| `src/lib/travel/types.ts` | Main-app normalized gateway request contract. |
| `src/lib/travel/gateway-client.ts` | Server-only authenticated gateway client used by QueryAgent; no participant identity crosses this boundary. |
| `src/lib/travel/booking-url.ts` | Booking URL allowlist retained for validation and storage boundaries; result cards do not render booking actions. |
| `services/travel-provider-gateway/src/contracts.ts` | Strict normalized gateway request, option, response, and stable error contracts. |
| `services/travel-provider-gateway/src/flyai-adapter.ts` | Safe FlyAI CLI adapter with fixture and live `data.itemList` response normalization. |
| `services/travel-provider-gateway/src/service.ts`, `services/travel-provider-gateway/src/server.ts` | Cache/retry/concurrency orchestration and authenticated internal HTTP service. |
| `src/lib/recommendation/calculate-run.ts` | Compatibility entry that dispatches automatic run creation to Supabase or the fallback store. |
| `src/lib/ai/deepseek-client.ts` | Server-only DeepSeek client and model configuration; each SDK attempt has a 15-second timeout and at most one retry. |
| `src/lib/ui/meeting-history.ts` | Browser-local recent-record parsing, dedupe, snapshot caching, and storage helpers. |

## Agent Flow

1. Manager and Query orchestration are deterministic. After complete verified-quote coverage, Calculation and Supervisor call the provider-neutral `AgentModel`; the current provider is DeepSeek using `DEEPSEEK_MODEL` or `deepseek-v4-flash`.
2. The model receives bounded, sanitized inputs and strict closed output schemas. The DeepSeek V4 adapter explicitly requests JSON, provides format guidance, caps output at 4096 tokens, disables thinking for deterministic structured turns, and retries once on `MODEL_INVALID_OUTPUT`. Calculation can reference only verified quote IDs; Supervisor returns an allowlisted decision/correction contract.
3. Calculation proposes one city from verified candidate facts. Its model input uses `missingTaskIds` as the controlled coverage signal and contains no `coverageComplete`, `deterministicPolicyResult`, or other preselected winner. When the proposed city matches the deterministic winner, Calculation canonicalizes schemes, totals, and comparison evidence from `rankEligibleCities` before validation. Deterministic policy replay still rejects an incorrect city or invalid evidence before Supervisor approval or publication.
4. Missing credentials, unavailable models, exhausted invalid-output retries, or two rejected proposals fail the run closed. Retryable model and Supervisor-review persist failures stay inside the two-attempt proposal loop rather than becoming an unexpected advance-lease failure. Deterministic validators recheck quote ownership, arrival dates, totals, scheme policy, and publication state before any shared result can become visible.

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

- Keep user-facing copy in Chinese on both mobile and desktop. Flow/marketing tone and visual phases follow `docs/superpowers/specs/2026-07-17-ui-copy-and-visual-direction.md` (phases 1–4 + adaptive shell + inner atmosphere/meetup copy shipped). Plan/result IA: `docs/superpowers/specs/2026-07-17-plan-result-ia-design.md`. Shell scenic + meetup CTA: `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md`.
- Create/join/plan/result/records use `ResponsiveShell` as a single-column adaptive workflow (fluid `max-w-2xl`, no fake phone chrome). `/` is a full-bleed zero-scroll train-window hero (brand `meetpoint`) that continuously cycles all four clips. Functional routes use one fixed scenic clip each (create=静水, join=静水, plan=密林, result=破晓, records=破晓, alternatives=静水, manage=密林) under a readable scrim; content stays `isolate` so CTAs remain clickable. Wait/reveal `PeakScenicAccent` is transparent glass over that same route scene, not a second video. Host plan CTA:「开始见面」/「见面安排中」.
- `ResponsiveShell` remains the default shell for create/join/plan/result/records (dark scenic interior, glass panels/CTAs). Content scrolls inside the shell when needed.
- Main flow pages use the `ResponsiveShell` top-left back action instead of mixing back navigation into bottom business actions.
- City combobox candidates render in normal document flow and disappear after a city is selected so transport-mode controls remain reachable.
- Next.js development indicators are disabled in `next.config.ts` so local browser checks do not show the bottom-left `N` overlay.
- `next.config.ts` allows `127.0.0.1` plus the machine's active non-internal IPv4 addresses for phone testing. This is derived at server start rather than hard-coded, so changing Wi-Fi networks does not make Next.js block client development resources and leave phones with non-hydrated HTML.

## Verification

Run after code changes:

```bash
npm run lint
npm run test
npm run build
```

For the isolated gateway, run the same three commands from `services/travel-provider-gateway/`. The current Dockerfile is a Node 20 multi-stage, non-root image; it receives secrets only at runtime. Image build and container `/healthz` smoke remain unverified when the host Docker daemon is unavailable; that is non-blocking residual hygiene, not a Multi-Agent release gate.

In managed sandboxes, `npm run build` can fail if Turbopack cannot create a process and bind a local port. Re-run the same command in an environment that permits local port binding before release.
