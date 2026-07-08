# Cross-City MeetPoint MVP Design

Date: 2026-07-08

## Summary

Build a clean, mobile-first Web H5 product for multi-person cross-city meeting planning in China. Users create a meeting plan, share a link, collect each participant's departure city and acceptable transport modes, then manually calculate recommended meeting cities.

The MVP supports 2-6 participants, city-level input, one-way arrival cost only, real ticket data where available, and clearly labeled estimates where real data is unavailable. Results are presented as three decision-oriented recommendations: cheapest, balanced, and fastest.

The implementation will be a new clean Next.js + Supabase project. Existing MeetPoint projects are references only; selected ideas will be migrated, not edited in place.

## Confirmed Product Decisions

- Platform: Web H5 first, mobile-first UI.
- Participant flow: default self-fill via shared link, with host fallback to add or edit participants.
- Participant count: 2-6 people.
- Location granularity: city-level, not exact address-level.
- Cost scope: one-way arrival cost only. Return trips are out of scope for MVP.
- Transport modes: each participant chooses acceptable modes from flight, high-speed train/EMU, and normal train.
- Candidate cities: generated automatically, with host ability to add or exclude cities.
- Results: three primary cards for cheapest, balanced, and fastest.
- Login: no login in MVP. Host uses a management passcode/token.
- Calculation timing: manual calculation, with stale-result warning.
- Direct/transfer policy: check direct options first; if unavailable, try transfer options.
- Arrival window: must arrive before meeting time; 0-6 hours early is acceptable, 6-12 hours early is penalized, over 12 hours early or late arrival is excluded from primary recommendations.
- Missing prices: use estimates as fallback, but mark them clearly and penalize them in ranking.
- Amap: built-in city library first; Amap only for city search autocomplete and validation.
- Data layer: Supabase database and Realtime.
- Frontend stack: Next.js App Router + Supabase + Vercel.
- LLM: DeepSeek is used for explanation, summaries, risk phrasing, and share copy, not for core scoring or ticket lookup.

## External Capability Assumptions

Fliggy FlyAI/FlyAI Skill is the preferred source for real flight and train ticket options. Its public skill docs expose structured commands such as `search-flight` and `search-train`, returning structured results. The product should hide this behind a provider interface because the exact production access path may be API, MCP, CLI, or Skill-compatible tooling.

Amap is the preferred source for city autocomplete and validation, but the recommendation algorithm must not depend on Amap availability. The built-in city library remains the source of truth for city metadata used by scoring.

MCP and Skill integrations do not require DeepSeek in the MVP because the app already gathers structured parameters through forms. The backend can call providers deterministically. DeepSeek may call tools later only if the product adds conversational planning.

References:

- DeepSeek API docs: https://api-docs.deepseek.com/
- FlyAI Skill docs: https://github.com/alibaba-flyai/flyai-skill
- MCP introduction: https://modelcontextprotocol.io/docs/getting-started/intro
- Next.js Route Handlers: https://nextjs.org/docs/app/api-reference/file-conventions/route
- Supabase Realtime Postgres changes: https://supabase.com/docs/guides/realtime/postgres-changes
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security

## Product Scope

### In Scope

- Create a meeting plan.
- Generate a public share link and host management passcode/token.
- Let participants submit or edit their own city and transport preferences.
- Let host add, edit, or remove participants.
- Let host add or exclude candidate cities.
- Generate candidate meeting cities.
- Query real one-way travel options through a travel provider.
- Fall back to estimated prices when real options fail.
- Score candidates and show cheapest, balanced, and fastest recommendations.
- Show detailed per-person travel options under each recommendation.
- Mark estimates, transfers, long waits, missing options, and stale results clearly.
- Use DeepSeek to generate structured explanations, risk summaries, and share copy from already-computed results.

### Out of Scope

- Login or account system.
- Return-trip pricing.
- Hotels.
- In-city POI, restaurants, map routing, or exact meeting locations.
- Payment, booking, checkout, or ticket purchase.
- Price monitoring, automatic recalculation, or alerts.
- Full admin dashboard.
- LLM-driven ranking or LLM-generated ticket prices.

## User Flows

### Host Creates a Plan

1. Host opens `/create`.
2. Host enters meeting name, meeting date, target arrival time, and participant limit.
3. System creates a plan, public code, share URL, and management token/passcode.
4. Host shares the public link.

### Participant Joins

1. Participant opens `/p/[code]`.
2. Participant sees plan details and current completion status.
3. Participant opens `/p/[code]/join`.
4. Participant enters name, departure city, and acceptable transport modes.
5. System stores a participant edit token locally and optionally provides an edit link.

### Host Manages the Plan

1. Host opens `/p/[code]/manage`.
2. Host enters management passcode/token.
3. Host reviews participants, fills missing data, edits candidates, and starts calculation.

### System Calculates Results

1. System generates 8-12 candidate cities.
2. System queries travel options for each participant and candidate city.
3. System scores each city.
4. System writes raw travel options, recommendation scores, and run metadata.
5. System uses DeepSeek to generate explanations from structured output.
6. Result page displays three primary recommendation cards and backup cities.

## Pages

### `/`

The home page is not a marketing landing page. It is a focused creation entry. It should show a concise product promise, a primary create button, and optional plan-code entry.

### `/create`

Host creates a plan. Keep this short: meeting name, date, target arrival time, participant limit. Advanced candidate editing is reserved for the management page.

### `/p/[code]`

Public plan page. Shows plan summary, participant completion status, join/edit entry, and current result state. If no run exists, show that the host has not calculated yet.

### `/p/[code]/join`

Participant form. Inputs: name, departure city, and acceptable transport modes. City input uses built-in city search plus Amap validation/autocomplete when available.

### `/p/[code]/manage`

Host management page. Requires management token/passcode. Supports participant management, candidate city add/exclude, calculation start, calculation status, and error review.

### `/p/[code]/result`

Decision-first result page. Primary area shows cheapest, balanced, and fastest cards. Each card shows city, total one-way price, average price, arrival risk, why it is recommended, and warning badges. Expanded details show each participant's travel options. Backup cities are below primary cards.

## Data Model

### `plans`

Stores meeting plan metadata:

- `id`
- `code`
- `title`
- `meeting_date`
- `target_arrival_time`
- `participant_limit`
- `management_token_hash`
- `status`
- `created_at`
- `updated_at`
- `last_calculated_at`

### `participants`

Stores participant-level inputs:

- `id`
- `plan_id`
- `name`
- `departure_city_code`
- `departure_city_name`
- `accepted_modes`
- `edit_token_hash`
- `created_by_host`
- `created_at`
- `updated_at`

### `candidate_cities`

Stores generated and manual candidate controls:

- `id`
- `plan_id`
- `city_code`
- `city_name`
- `source`: `system`, `manual_add`, `manual_exclude`
- `enabled`
- `created_at`

### `recommendation_runs`

Stores each manual calculation:

- `id`
- `plan_id`
- `status`: `pending`, `running`, `completed`, `failed`, `partial`
- `started_at`
- `completed_at`
- `stale_after`
- `error_summary`

### `travel_options`

Stores participant-city travel options:

- `id`
- `run_id`
- `participant_id`
- `candidate_city_code`
- `mode`: `flight`, `high_speed_rail`, `normal_train`
- `source`: `real`, `estimated`, `unavailable`
- `provider`: `flyai`, `amap`, `estimate`
- `price_cny`
- `depart_at`
- `arrive_at`
- `duration_minutes`
- `wait_minutes`
- `is_direct`
- `has_transfer`
- `transfer_count`
- `booking_url`
- `failure_reason`
- `raw_payload_ref`

### `city_recommendations`

Stores city-level scoring:

- `id`
- `run_id`
- `city_code`
- `city_name`
- `total_price_cny`
- `avg_price_cny`
- `total_duration_minutes`
- `fairness_gap`
- `waiting_penalty`
- `transfer_penalty`
- `estimate_penalty`
- `missing_penalty`
- `score_cheapest`
- `score_balanced`
- `score_fastest`
- `labels`
- `explanation`
- `risk_summary`

### `ai_explanations`

Optional separate table if explanation history is needed:

- `id`
- `run_id`
- `city_recommendation_id`
- `model`
- `input_hash`
- `output_json`
- `created_at`

## Provider Architecture

Business logic must depend on internal interfaces, not on vendor-specific code.

### Travel Provider Interface

`TravelProvider` accepts structured inputs:

- origin city
- destination city
- meeting date
- target arrival time
- allowed modes
- direct-first strategy

It returns normalized `TravelOption` objects. FlyAI/Fliggy is the first implementation.

### City Provider Interface

`CityProvider` supports:

- local city search
- city metadata lookup
- Amap autocomplete and validation

Built-in city data is the source of truth. Amap improves input quality but does not block the product.

### AI Explainer Interface

`RecommendationExplainer` accepts computed recommendations and returns structured JSON:

- `short_reason`
- `risk_badges`
- `share_summary`
- `detail_explanation`

DeepSeek is the first implementation. The service must validate JSON output before showing it. If validation fails, use deterministic fallback copy.

## Recommendation Algorithm

### Candidate City Generation

Generate 8-12 candidates from:

- all participant departure cities
- transport hub cities near the geographic middle area
- major provincial capitals, municipalities, airport hubs, and high-speed rail hubs
- host manually added cities

Remove manually excluded cities.

### Travel Query

For each participant and candidate city:

1. Filter by participant accepted modes.
2. Query direct options first.
3. If no direct option exists, query transfer options.
4. Keep options that arrive before target arrival time.
5. Treat 0-6 hours early as acceptable.
6. Penalize 6-12 hours early.
7. Exclude options over 12 hours early or late from primary recommendations.

### Price Fallback

Each option must be labeled:

- `real`: returned by provider
- `estimated`: fallback estimate
- `unavailable`: no usable option

Estimates can participate in sorting but must receive an estimate penalty and be visually marked as approximate.

### City Scoring

For every candidate city, compute:

- total price
- average price
- total duration
- fairness gap
- waiting penalty
- transfer penalty
- estimate penalty
- missing penalty

Primary recommendation rules:

- Cheapest: price weight is highest; no unavailable participant option.
- Balanced: fairness weight is highest; price and duration remain secondary.
- Fastest: duration weight is highest; long waits are heavily penalized.

The same city may appear in multiple categories if it wins multiple scoring modes. The UI should say so instead of forcing artificial variety.

## Error Handling

- FlyAI/Fliggy query failure: keep city, use estimate if possible, label as `estimated`.
- Participant has no available option for a city: city cannot appear as a primary recommendation and should be shown in backup with reason.
- Amap failure: fall back to built-in city search.
- Supabase Realtime failure: page remains usable and prompts user to refresh.
- Calculation timeout: save partial results and allow host retry.
- Stale result: after 30 minutes, mark prices as possibly changed and suggest recalculation.
- DeepSeek failure: use deterministic fallback explanation.
- DeepSeek malformed JSON: discard output and use fallback explanation.

## Security

- Store management passcode/token as a hash only.
- Store participant edit token as a hash only.
- Keep FlyAI, Amap, DeepSeek, and Supabase service credentials only in server-side environment variables.
- Enable Supabase RLS for exposed tables.
- Public link can read plan-level public data and submit/edit only own participant data.
- Host management operations require management token/passcode.
- Do not collect phone numbers, ID numbers, or payment details in MVP.

## Validation And Testing

Minimum verification:

- `npm run lint`
- `npm run build`
- Unit tests for candidate generation.
- Unit tests for city scoring.
- Unit tests for estimate, transfer, waiting, and missing-option penalties.
- API tests for plan creation, participant submission, management token checks, and manual calculation.
- H5 manual acceptance at mobile width for creation, join, management, calculation, and result expansion.

## Reference Code Reuse

### Reuse Ideas From `MeetPoint3-main`

- plan/room code generation
- share-link flow
- participant insertion flow
- Supabase Realtime participant updates
- result page pattern for participants and computed output

### Borrow Patterns From `meetpoint2-main`

- service-layer recommendation structure
- scored result fields
- card-based explanation of why a place was recommended

### Do Not Reuse

- Kakao or ODsay adapters
- same-city subway station recommendation logic
- same-city map-first UI
- friends, chat, and login features
- C++ optimizer
- Leaflet/OSRM/Nominatim static demos

## Implementation Order

1. Create or update project rules with `AGENTS.md`.
2. Scaffold a clean Next.js project.
3. Add Supabase schema, RLS policies, and Realtime setup.
4. Implement plan creation, public link, management token, and participant submission.
5. Add built-in city library and candidate generation.
6. Implement deterministic scoring and recommendation storage.
7. Implement FlyAI travel provider and estimate fallback.
8. Implement Amap city autocomplete/validation.
9. Implement DeepSeek explanation provider with JSON validation and fallback copy.
10. Build mobile-first create, join, manage, and result pages.
11. Run lint, build, tests, and H5 manual acceptance.

## Open Risks

- FlyAI production access shape may be API, MCP, CLI, or Skill-compatible tooling. The provider interface must isolate this.
- Real ticket inventory and prices can change quickly. Results must be marked stale after 30 minutes.
- Estimated prices may be inaccurate. The UI must clearly distinguish approximate prices from real provider results.
- Vercel serverless execution time may constrain large calculations. The MVP should limit participants and candidate cities, and may later need background jobs.
