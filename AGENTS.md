# Project Rules

## Product

This project is a mobile-first Web H5 app for multi-person cross-city meeting planning in China.

## Development

- Use Chinese for user-facing copy.
- Use English for code, files, variables, and commit messages.
- Keep supplier facts, fare arithmetic, date filtering, evidence validation, and publication guardrails deterministic. The approved next architecture lets a policy-constrained Calculation Agent choose routes and the winning city only from verified quote IDs; see `docs/superpowers/specs/2026-07-15-multi-agent-recommendation-design.md`.
- Treat results as shared team decisions: publish one city with saving and fast schemes, show per-participant travel details, and do not use average fare as a UI decision metric.
- Do not publish estimated fares or incomplete participant coverage in the approved next result flow. Until that architecture is implemented, document current estimate fallback behavior explicitly as current behavior rather than the target product contract.
- Expose recommendation cards and a result entry only after the latest run is `completed`; a `running` run remains an in-progress state.
- Keep the agent model provider-neutral behind an `AgentModel` boundary. DeepSeek remains explanation-only in the current implementation; the approved next architecture may use it for Manager, Calculation, Supervisor, and Fallback reasoning without giving it authority to invent or mutate supplier facts.
- Keep secrets in server-side environment variables only.
- Keep browser Supabase access limited to the anon client; use the service-role client only in server-side code.
- Run `npm run lint`, `npm run test`, and `npm run build` before reporting completion after code changes.
- The travel gateway owns FlyAI credentials, CLI/MCP execution, input validation, timeouts, retries, caching, and stable error mapping.
- The travel gateway cannot generate candidate cities, select routes, score cities, call DeepSeek, or persist participant identity.
- Execute gateway CLI commands with argument arrays and shell execution disabled.
- Run the gateway lint, test, and build commands before reporting gateway changes complete.
- Ignore generated gateway `dist`, coverage, probe output, and cache artifacts.

## Structure

- `supabase/`: database schema, RLS policies, and Realtime publication setup.
- `src/lib/travel/`: vendor adapters and normalized travel option types.
- `services/travel-provider-gateway/`: isolated server-side travel-provider access; it must follow the travel gateway ownership and safety rules above.
- `src/lib/recommendation/`: current deterministic scoring and calculation orchestration; migrate it only through the approved multi-agent design and a reviewed implementation plan.
- `src/lib/city/`: city search, distance, and candidate generation.
- `src/lib/ai/`: DeepSeek explanation helpers.
- `src/lib/supabase/`: browser anon client and server-only service-role client.
- `src/app/api/`: route handlers; use the service-role Supabase client only in server-side files.
- `src/app/`: mobile-first App Router pages with Chinese user-facing copy.
- `src/components/layout/`: shared responsive page shells; desktop routes should remain centered phone-sized H5 canvases.
- `src/components/`: mobile-first UI components.
- `docs/architecture.md`: stable technical map for routes, data flow, modules, and security boundaries.
- `docs/integration-guide.md`: stable setup, API, error-code, and smoke-test reference for handoff.
- `docs/superpowers/specs/`: approved product and technical design specs.
- `docs/superpowers/plans/`: implementation plans derived from approved specs.
