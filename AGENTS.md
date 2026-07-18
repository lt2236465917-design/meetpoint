# Project Rules

## Product

This project is a mobile-usable Web app for multi-person cross-city meeting planning in China (shareable plan links must still work on phones). Shipped UI uses a true adaptive layout (no fake phone frame): full-bleed home hero, `ResponsiveShell` with fluid `max-w-2xl` content width — `docs/superpowers/specs/2026-07-17-desktop-adaptive-shell-design.md`.

## Development

- Use Chinese for user-facing copy.
- User-facing flow and marketing copy should feel like friends arranging a meetup, not a fare calculator. Avoid `开算` / calculator framing on primary CTAs; keep result/progress trust language (real fares, no estimates) intact. Canonical direction: `docs/superpowers/specs/2026-07-17-ui-copy-and-visual-direction.md`. Approved host CTA on the public plan:「开始见面」/「见面安排中」(not「算出见面城市」/「发起计算」) — `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md`.
- `/` uses `src/components/home/HomeHero.tsx` (full-bleed train-window hero, glass CTA → `/create`, opening viewport zero-scroll). `最近见面记录` lives on `/records` (hero entry: “最近记录”). Create/join/plan/result/records stay `ResponsiveShell` with shared `.atmosphere-*` tokens from `src/app/globals.css`. **Create/join:** no looping scenic video behind forms (static deepen only). **Plan/result/records:** muted low-opacity shell scenic under a dark scrim is approved (follows home scene via `meetpoint:scenic-scene`) — implement/ship only per `docs/superpowers/specs/2026-07-18-inner-atmosphere-meetup-copy-design.md` and `docs/superpowers/plans/2026-07-18-inner-atmosphere-meetup-copy.md`.
- Plan/result IA is StatusLane + glass schemes per `docs/superpowers/specs/2026-07-17-plan-result-ia-design.md` (shipped). Do not deep-restyle alternatives/manage unless a later IA pass is approved. Phase 4 `PeakScenicAccent` stays on wait/reveal peaks; it does not replace shell scenic on plan/result/records once that pass ships.
- Recommended Chinese explanations must be exact members of `SAFE_EXPLANATIONS_ZH` in `src/lib/agent/prompts.ts`; update whitelist, prompt example, fallback store, and tests together.
- Use English for code, files, variables, and commit messages.
- Keep supplier facts, fare arithmetic, date filtering, evidence validation, and publication guardrails deterministic. The Calculation Agent may choose the winning city only from verified quote IDs; see `docs/superpowers/specs/2026-07-15-multi-agent-recommendation-design.md`.
- Calculation model input must not include `coverageComplete`, `deterministicPolicyResult`, or any other preselected winner. When the model selects the deterministic winning city, canonicalize schemes, totals, and comparison evidence from `rankEligibleCities` before validation; never invent or mutate supplier quote facts.
- Treat results as shared team decisions: publish one city with saving and fast schemes, show per-participant travel details, and do not use average fare as a UI decision metric.
- Do not publish estimated fares or incomplete participant coverage. Do not reintroduce target-arrival-time, estimated-fare, weighted three-city scoring, or explanation-only recommendation paths; `tests/no-legacy-recommendation-path.test.ts` enforces this boundary.
- Expose saving/fast scheme cards only from the `completed` run that owns the current non-superseded shared result. Before any shared result exists, all non-completed automatic run states render progress, retry, or diagnostic guidance; a pending private preview never hides or replaces the current shared city.
- Keep alternative previews private to their requesting participant and the host. Unauthorized reads and plan/run mismatches return 404.
- Confirm a preview only from a valid `x-host-token` and the server-selected exact Supervisor-approved proposal. Never derive host authority from participant tokens, request bodies, query parameters, browser-local roles, or client-supplied proposal IDs.
- Keep the agent model provider-neutral behind an `AgentModel` boundary. The DeepSeek adapter retries once on `MODEL_INVALID_OUTPUT`; orchestrator retryable model or Supervisor-review persist failures stay inside the two-attempt proposal loop. Calculation and Supervisor still cannot invent supplier facts; deterministic validators and publication guards remain decisive.
- Keep secrets in server-side environment variables only.
- Keep browser Supabase access limited to the anon client; use the service-role client only in server-side code.
- Run `npm run lint`, `npm run test`, and `npm run build` before reporting completion after code changes.
- The travel gateway owns FlyAI credentials, CLI/MCP execution, input validation, timeouts, retries, caching, and stable error mapping.
- The travel gateway cannot generate candidate cities, select routes, score cities, call DeepSeek, or persist participant identity.
- Execute gateway CLI commands with argument arrays and shell execution disabled.
- Run the gateway lint, test, and build commands before reporting gateway changes complete.
- Ignore generated gateway `dist`, coverage, probe output, and cache artifacts.
- Live supplier publication requires a reachable travel gateway at `TRAVEL_GATEWAY_URL`; do not treat `GATEWAY_UNAVAILABLE` with zero verified quotes as supplier cooldown evidence.
- Multi-Agent Tasks 1–14 are complete. Canonical evidence: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`. Do not claim Supabase credentials were rotated; the operator waived rotation on 2026-07-17.

## Structure

- `supabase/`: database schema, RLS policies, and Realtime publication setup.
- `src/lib/travel/`: normalized gateway request contract, authenticated server client, and booking-URL validation.
- `services/travel-provider-gateway/`: isolated server-side travel-provider access; it must follow the travel gateway ownership and safety rules above.
- `src/lib/recommendation/`: deterministic policy, validators, query-matrix execution, persistence, and compatibility entry points.
- `src/lib/city/`: city search, distance, and candidate generation.
- `src/lib/ai/`: server-only DeepSeek client and model configuration used behind `AgentModel`.
- `src/lib/supabase/`: browser anon client and server-only service-role client.
- `src/app/api/`: route handlers; use the service-role Supabase client only in server-side files.
- `src/app/`: App Router pages with Chinese user-facing copy (mobile-usable adaptive shell, not fake phone chrome); includes `/records` for local meeting history.
- `src/components/home/`: product home hero (`HomeHero`); scenic video on `/`, plus wait/reveal peaks via `PeakScenicAccent`.
- `src/components/layout/`: `ResponsiveShell` for create/join/plan/result/records; `.atmosphere-*` tokens; fluid adaptive `max-w-2xl` content width per adaptive-shell spec. Approved next: optional shell scenic backdrop on plan/result/records only (`2026-07-18-inner-atmosphere-meetup-copy-design.md`).
- `src/components/plan/RecentMeetingRecords.tsx`: browser-local history list used by `/records`.
- `src/components/`: UI components.
- `src/components/result/`: shared one-city/two-scheme rendering and bounded run-progress feedback; `PeakScenicAccent` on wait/reveal peaks only; render persisted scheme routes directly, never reselect routes client-side, and let a nonterminal automatic result page post one bounded authenticated advance before refresh when the device has a local participant token.
- `docs/architecture.md`: stable technical map for routes, data flow, modules, and security boundaries.
- `docs/integration-guide.md`: stable setup, API, error-code, and smoke-test reference for handoff.
- `docs/acceptance/`: Multi-Agent live acceptance record, including non-blocking residual hygiene.
- `docs/superpowers/README.md`: authority order for current specifications, plans, the recovery ledger, and historical records.
- `docs/superpowers/specs/`: approved product and technical design specs.
- `docs/superpowers/plans/`: implementation plans derived from approved specs.
