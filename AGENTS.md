# Project Rules

## Product

This project is a mobile-first Web H5 app for multi-person cross-city meeting planning in China.

## Development

- Use Chinese for user-facing copy.
- Use English for code, files, variables, and commit messages.
- Keep ticket lookup, city ranking, and scoring deterministic.
- Use DeepSeek only for explanation, risk summaries, and share text.
- Keep secrets in server-side environment variables only.
- Keep browser Supabase access limited to the anon client; use the service-role client only in server-side code.
- Run `npm run lint`, `npm run test`, and `npm run build` before reporting completion after code changes.

## Structure

- `supabase/`: database schema, RLS policies, and Realtime publication setup.
- `src/lib/travel/`: vendor adapters and normalized travel option types.
- `src/lib/recommendation/`: deterministic scoring and calculation orchestration.
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
