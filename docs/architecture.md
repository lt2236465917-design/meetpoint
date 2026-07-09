# Cross-City MeetPoint Architecture

This document is the stable technical map for the MVP. Detailed task history lives in git commits and `docs/superpowers/plans/`.

## Runtime Shape

- Next.js App Router renders the responsive H5 pages under `src/app/`; desktop viewports show the same H5 workflow in a centered phone-sized canvas.
- Route handlers under `src/app/api/` use the server-side Supabase service-role client.
- When Supabase server variables are missing, route handlers use the server-side in-memory fallback store in `src/lib/fallback/mvp-store.ts` so the local create-to-result MVP can be smoke-tested without external credentials.
- Browser-side Supabase access must use only the anon client from `src/lib/supabase/client.ts`.
- Deterministic business logic lives in `src/lib/`; route handlers orchestrate validation, persistence, and service calls.

## User-Facing Routes

| Route | Purpose |
| --- | --- |
| `/` | Focused creation entry for the H5 app. |
| `/create` | Host creates a plan and receives the public link plus management token. |
| `/p/[code]` | Public plan summary, participant completion state, join entry, and result entry. |
| `/p/[code]/join` | Participant submits name, departure city, and accepted transport modes. |
| `/p/[code]/manage` | Host enters the management token, edits candidate-city controls, and starts calculation. |
| `/p/[code]/result` | Shows the latest recommendation run, stale-result warning, and top recommendation cards. |

## API Routes

| Route | Method | Purpose | Auth |
| --- | --- | --- | --- |
| `/api/plans` | `POST` | Create a plan from title, meeting date, arrival time, and participant limit. | None |
| `/api/plans/[code]` | `GET` | Read plan metadata, participants, and latest run. | None |
| `/api/plans/[code]/participants` | `POST` | Submit participant city and transport preferences. | None |
| `/api/plans/[code]/candidates` | `GET` | Read stored candidate-city controls. | None |
| `/api/plans/[code]/candidates` | `POST` | Add or exclude a candidate city. | `x-management-token` |
| `/api/plans/[code]/calculate` | `POST` | Run deterministic recommendation calculation. | `x-management-token` |
| `/api/plans/[code]/explain` | `POST` | Regenerate explanations for the latest recommendation run. | None |
| `/api/cities/search` | `GET` | Search built-in city data by query. | None |

## Data Flow

1. Host creates a row in `plans`; the management token is returned once and only its hash is stored.
2. Participants submit rows in `participants`; each edit token is returned once and only its hash is stored.
3. Host candidate controls are stored in `candidate_cities` as `manual_add` or `manual_exclude`.
4. Manual calculation generates candidate cities, queries the travel provider boundary, scores candidates, and writes:
   - `recommendation_runs`
   - `travel_options`
   - `city_recommendations`, including DeepSeek/fallback explanation fields
5. The explain API can regenerate explanation and risk-summary fields for the latest run without changing deterministic scores.
6. Result pages read the latest run and city recommendations. Results become stale after 30 minutes.

In fallback mode, the same logical records are kept in process memory instead of Supabase. Fallback mode is non-persistent and exists only for local smoke testing.

## Core Modules

| Module | Responsibility |
| --- | --- |
| `src/components/layout/ResponsiveShell.tsx` | Shared mobile-first page shell with a viewport-height H5 canvas, centered on desktop. |
| `src/lib/city/candidate-generator.ts` | Deterministic candidate-city generation from participant cities and host controls. |
| `src/lib/city/city-provider.ts` | Local-first city search; Amap is reserved for autocomplete/validation fallback. |
| `src/lib/fallback/mvp-store.ts` | In-memory local fallback persistence for create-to-result smoke testing without Supabase credentials. |
| `src/lib/travel/types.ts` | Vendor-neutral travel-provider interface and normalized option types. |
| `src/lib/travel/estimate-provider.ts` | Deterministic estimated option fallback. |
| `src/lib/travel/flyai-provider.ts` | FlyAI provider shell; falls back to estimates until production access is configured. |
| `src/lib/recommendation/scoring.ts` | Deterministic scoring and primary recommendation selection. |
| `src/lib/recommendation/calculate-run.ts` | Calculation orchestration, explanation generation, and Supabase persistence. |
| `src/lib/ai/recommendation-explainer.ts` | DeepSeek explanation shell with deterministic fallback copy. |

## Security Boundaries

- Keep service-role Supabase access in server-side code only.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `AMAP_API_KEY`, `DEEPSEEK_API_KEY`, `FLYAI_API_KEY`, and `FLYAI_CLI_PATH` out of browser code.
- Management and participant edit tokens are stored as hashes only.
- Core ranking, ticket lookup normalization, and scoring must remain deterministic; DeepSeek may explain computed results but must not decide rankings.
- Fallback mode is local-only and must not be treated as durable storage.

## UI Boundaries

- Keep user-facing copy in Chinese on both mobile and desktop.
- Target routes must stay usable as product workflows on desktop; do not replace them with a marketing landing page.
- `ResponsiveShell` is the default page shell for the main user routes. It keeps the workflow as a single-column, viewport-height H5 canvas on mobile and desktop, with the main content scrolling inside the canvas instead of stretching into a long document page.
- Next.js development indicators are disabled in `next.config.ts` so local browser checks do not show the bottom-left `N` overlay.

## Verification

Run after code changes:

```bash
npm run lint
npm run test
npm run build
```

In managed sandboxes, `npm run build` can fail if Turbopack cannot create a process and bind a local port. Re-run the same command in an environment that permits local port binding before release.
