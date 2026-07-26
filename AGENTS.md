# Project Rules

## Product

This project is a mobile-usable Web app for multi-person cross-city meeting planning in China (shareable plan links must still work on phones). Shipped UI uses a true adaptive layout (no fake phone frame): full-bleed home hero, `ResponsiveShell` with fluid `max-w-2xl` content width — `docs/superpowers/specs/2026-07-17-desktop-adaptive-shell-design.md`.

## Development

- Use Chinese for user-facing copy.
- User-facing flow and marketing copy should feel like friends arranging a meetup, not a fare calculator. Avoid `开算` / calculator framing on primary CTAs; keep result/progress trust language (real fares, no estimates) intact. Canonical direction: `docs/superpowers/specs/2026-07-17-ui-copy-and-visual-direction.md`. Host CTA on the public plan:「开始见面」/「见面安排中」(not「算出见面城市」/「发起计算」) — `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md`.
- `/` uses `src/components/home/HomeHero.tsx` (full-bleed train-window hero, glass CTA → `/create`, opening viewport zero-scroll). Home brand mark is `meetpoint` (not「跨城见面」). The home must continuously cycle all four `SCENIC_VIDEOS` and still allow manual scene selection; do not reduce it to one fixed clip. `最近见面记录` lives on `/records` (hero entry: “最近记录”). Every functional route uses one deterministic muted looping scenic clip under a readable dark scrim (no four-clip cycling inside functional pages): create=静水, join=静水, plan=密林, result=破晓, records=破晓, alternatives=静水, manage=密林. The functional scenic video is root-mounted so navigation/loading/refresh does not restart same-scene playback — `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md`.
- Scenic preference: never initialize React state with `useState(readScenicSceneIndex)` (SSR/client mismatch → Next.js error overlay steals clicks). Hydrate with a stable default (`0`), then restore from `localStorage` in `useEffect` / `useSyncExternalStore`. Decorative scenic `<video>` layers must be `pointer-events: none`; shell scrim must leave the scene readable (not near-opaque black). Scenic media uses same-origin fast-start MP4: desktop receives the original high-quality 1920×1080 footage, while viewports up to 767px receive a separate 1920×1080 mobile encode around 6–8 Mbps. Only the active home scene may preload. Android WeChat/TBS video tags must opt into same-layer H5 playback. If a mobile browser rejects autoplay, the active scenic video must retry on the first user pointer/touch gesture; `prefers-reduced-motion: reduce` remains an intentional static fallback and must not be overridden.
- Functional scenic video errors must fall through to the visible static fallback without imperatively setting a persistent inline `display:none`; a transient source-selection error may recover and must not keep the shared backdrop hidden across every functional route.
- Home scenic cycling must not depend only on the media `ended` event. Near-end playback progress must advance to the next scene so browsers that pause on the final frame still continue through all four clips; the next clip becomes active before it begins loading, preserving the active-only preload rule.
- Local phone acceptance uses the machine's active LAN IPv4 address. `next.config.ts` must derive current non-internal IPv4 origins instead of hard-coding one historical Wi-Fi address, otherwise Next.js blocks client development resources and phones receive non-hydrated HTML.
- Departure city search uses the server-side Amap administrative-district API as the canonical non-hub lookup so every mainland prefecture-level administrative unit and direct-administered municipality can be selected. Input tips may enrich province labels but must not be treated as canonical city adcodes because it commonly returns district-level codes. `amap-<adcode>` departures are valid route origins; they remain excluded from the built-in meeting-candidate library.
- Plan arrival dates use Asia/Shanghai calendar days. The create form must set the native date input minimum to today, client validation must explain past-date rejection, and the create API must independently reject dates earlier than today.
- Plan/result IA is StatusLane + glass schemes per `docs/superpowers/specs/2026-07-17-plan-result-ia-design.md` (shipped). Do not deep-restyle alternatives/manage; their approved fixed scenic background is shared-shell atmosphere only. `PeakScenicAccent` stays on wait/reveal peaks as a transparent glass treatment that reveals the route-fixed page scene; it must not mount a second scenic video.
- Recommended Chinese explanations must be exact members of `SAFE_EXPLANATIONS_ZH` in `src/lib/agent/prompts.ts`; update whitelist, prompt example, fallback store, and tests together.
- Use English for code, files, variables, and commit messages.
- Keep supplier facts, fare arithmetic, date filtering, evidence validation, and publication guardrails deterministic. The Calculation Agent may choose the winning city only from verified quote IDs; see `docs/superpowers/specs/2026-07-15-multi-agent-recommendation-design.md`.
- Treat gateway `quoteId` as a physical evidence identifier that may repeat across participants sharing the same route. Materialization and validation must resolve verified evidence by `(participantId, quoteId)`, never by a global quote-ID map.
- Materialize recommendation result, scheme, and route rows only through one database transaction. The database must derive aggregates and replay the run's supported deterministic policy from persisted verified evidence before materialization and immediately before sharing; application-approved totals are assertions, not publication facts.
- Calculation model input must not include `coverageComplete`, `deterministicPolicyResult`, or any other preselected winner. When the model selects the deterministic winning city, canonicalize schemes, totals, and comparison evidence from `rankEligibleCities` before validation; never invent or mutate supplier quote facts.
- Treat results as shared team decisions: publish one city with saving and fast schemes, show per-participant travel details, and do not use average fare as a UI decision metric.
- Saving means the exact lowest verified fare inside each participant's direct-first eligible set across accepted modes (including direct normal train); equal-fare ties use transfers, duration, then quote ID. Fast remains the fastest direct-first team combination within 130% of the saving total. Policy version: `2026-07-19.v2`.
- Do not publish estimated fares or incomplete participant coverage. Do not reintroduce target-arrival-time, estimated-fare, weighted three-city scoring, or explanation-only recommendation paths; `tests/no-legacy-recommendation-path.test.ts` enforces this boundary.
- Expose saving/fast scheme cards only from the `completed` run that owns the current non-superseded shared result. Before any shared result exists, all non-completed automatic run states render progress, retry, or diagnostic guidance; a pending private preview never hides or replaces the current shared city.
- On automatic result pages, `incomplete` / `failed` are terminal: never label a no-op page refresh as a retry. A device with its stored participant credential must be able to create a new automatic run through the existing calculate boundary; otherwise guide the user back to the public plan. Unexpected run-advance exceptions must be logged server-side with run/trace context while public persistence remains limited to safe diagnostic codes.
- Keep alternative previews private to their requesting participant and the host. Unauthorized reads and plan/run mismatches return 404.
- Confirm a preview only from a valid `x-host-token` and the server-selected exact Supervisor-approved proposal. Never derive host authority from participant tokens, request bodies, query parameters, browser-local roles, or client-supplied proposal IDs.
- Keep the agent model provider-neutral behind an `AgentModel` boundary. The DeepSeek adapter retries once on `MODEL_INVALID_OUTPUT`; orchestrator retryable model or Supervisor-review persist failures stay inside the two-attempt proposal loop. Calculation and Supervisor still cannot invent supplier facts; deterministic validators and publication guards remain decisive.
- Keep secrets in server-side environment variables only.
- Keep browser Supabase access limited to the anon client; use the service-role client only in server-side code.
- Public plan and shared-result reads go through server-rendered pages or `GET /api/plans/[code]`; browser `anon` / `authenticated` roles have no direct business-table or Realtime read access. Private previews remain available only through their credentialed server API.
- Run `npm run lint`, `npm run test`, and `npm run build` before reporting completion after code changes.
- The travel gateway owns FlyAI credentials, CLI/MCP execution, input validation, timeouts, retries, caching, and stable error mapping.
- The travel gateway cannot generate candidate cities, select routes, score cities, call DeepSeek, or persist participant identity.
- Execute gateway CLI commands with argument arrays and shell execution disabled.
- FlyAI connecting itineraries must normalize the complete ordered segment set: first departure, final arrival, full elapsed duration, all service identities, and segmentCount - 1 transfers. Reject overlapping, out-of-order, over-eight-segment, or mixed requested-mode evidence instead of publishing a first-segment summary.
- Run the gateway lint, test, and build commands before reporting gateway changes complete.
- Ignore generated gateway `dist`, coverage, probe output, and cache artifacts.
- Live supplier publication requires a reachable travel gateway at `TRAVEL_GATEWAY_URL`; do not treat `GATEWAY_UNAVAILABLE` with zero verified quotes as supplier cooldown evidence.
- Multi-Agent Tasks 1–14 are complete. Canonical evidence: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`. Do not claim Supabase credentials were rotated; the operator waived rotation on 2026-07-17.

## Structure

- `supabase/`: database schema, RLS policies, and Realtime publication setup.
- `src/lib/travel/`: normalized gateway request contract, authenticated server client, and booking-URL validation.
- `services/travel-provider-gateway/`: isolated server-side travel-provider access; it must follow the travel gateway ownership and safety rules above.
- `src/lib/recommendation/`: deterministic policy, validators, query-matrix execution, persistence, and compatibility entry points.
- `tests/postgres/`: executable disposable-PostgreSQL behavior tests for migrations, transactions, policy replay, concurrency, and database roles. They run only through `npm run test:postgres` with a guarded local `TEST_DATABASE_URL`; default unit tests never access a database.
- `src/lib/city/`: city search, distance, and candidate generation.
- `src/lib/ai/`: server-only DeepSeek client and model configuration used behind `AgentModel`.
- `src/lib/supabase/`: browser anon client and server-only service-role client.
- `src/app/api/`: route handlers; use the service-role Supabase client only in server-side files.
- `src/app/`: App Router pages with Chinese user-facing copy (mobile-usable adaptive shell, not fake phone chrome); includes `/records` for local meeting history.
- `src/components/home/`: product home hero (`HomeHero`); scenic video on `/`; wait/reveal peaks use the route background through transparent `PeakScenicAccent` glass.
- `src/components/layout/`: `ResponsiveShell` for functional content; `.atmosphere-*` tokens; fluid adaptive `max-w-2xl` content width per adaptive-shell spec. Root-mounted `FunctionalScenicBackdrop` supplies the route-fixed muted scene and `ShellScenicBackdrop` checkpoints playback; shell pages never cycle all four clips.
- `src/components/plan/RecentMeetingRecords.tsx`: browser-local history list used by `/records`.
- `src/components/`: UI components.
- `src/components/result/`: shared one-city/two-scheme rendering and bounded run-progress feedback; transparent `PeakScenicAccent` glass on wait/reveal peaks only, with no nested scenic media; render persisted scheme routes directly, never reselect routes client-side, and let a nonterminal automatic result page post one bounded authenticated advance before refresh when the device has a local participant token.
- `docs/architecture.md`: stable technical map for routes, data flow, modules, and security boundaries.
- `docs/integration-guide.md`: stable setup, API, error-code, and smoke-test reference for handoff.
- `docs/acceptance/`: Multi-Agent live acceptance record, including non-blocking residual hygiene.
- `docs/superpowers/README.md`: authority order for current specifications, plans, the recovery ledger, and historical records.
- `docs/superpowers/specs/`: approved product and technical design specs.
- `docs/superpowers/plans/`: implementation plans derived from approved specs.
