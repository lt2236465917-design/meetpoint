# Amap And FlyAI Integration Design

**Date:** 2026-07-12

## Goal

Replace the current city-search and travel-provider shells with production-shaped Amap and FlyAI integrations while preserving deterministic candidate generation, route selection, scoring, and ranking.

The first release targets a small public beta of roughly 50-500 recommendation calculations per day. It uses FlyAI through an isolated travel-provider gateway for product validation while the team simultaneously confirms commercial authorization, production quotas, and a stable server-side access path.

## Product Decisions

- Amap is integrated first and does not wait for FlyAI approval.
- FlyAI follows a dual track: validate with the official CLI/MCP path, then replace the gateway's internal adapter when a formal production interface is available.
- Real prices are labeled as query-time reference prices with a query timestamp. Price and availability on the booking page are authoritative.
- The first release searches only routes departing on the meeting date and arriving no later than the target arrival time.
- Previous-day travel and accommodation cost are out of scope.
- Candidates with a mix of real and estimated routes remain eligible for ranking, receive the existing deterministic estimate penalty, and are visibly labeled as partially estimated.
- DeepSeek does not generate production candidates, select routes, score cities, or rank recommendations. It only explains already computed results, summarizes risks, and produces share copy.

## External Capability Basis

- Amap Web Service API provides server-side HTTP interfaces for input tips, administrative-region lookup, geocoding, and related location services. A Web Service API key is required.
- FlyAI's official documentation and repository expose structured `search-flight` and `search-train` commands, JSON output, booking links, and an optional formal API key. The documented execution path is Skill to CLI to Fliggy MCP API rather than a stable public HTTP contract intended for arbitrary application embedding.
- Traditional Fliggy merchant APIs are not treated as general consumer fare-search APIs. Production use of FlyAI must pass an explicit authorization and quota checkpoint.

References:

- https://lbs.amap.com/api/webservice/gettingstarted
- https://lbs.amap.com/api/webservice/summary
- https://flyai.open.fliggy.com/docs/overview
- https://flyai.open.fliggy.com/docs/quickstart
- https://github.com/alibaba-flyai/flyai-skill

## System Boundaries

### Main Next.js application

The main application owns:

- meeting and participant input;
- local city metadata and candidate generation;
- calls to Amap and the internal travel gateway;
- deterministic route filtering and per-participant route selection;
- deterministic scoring and recommendation ordering;
- estimated-route fallback;
- persistence and user-facing source, freshness, and booking feedback.

### Travel-provider gateway

Add a separately deployable service under `services/travel-provider-gateway/`. Before implementation, update `AGENTS.md` to define this new directory's responsibilities, structure, secret boundary, verification commands, and cleanup rules.

The gateway owns:

- a vendor-neutral authenticated HTTP contract;
- translation from normalized travel searches into FlyAI CLI/MCP calls;
- strict provider-response validation and normalization;
- timeouts, one retry, concurrency control, short-lived caching, and safe logging;
- stable internal error codes;
- the `FLYAI_API_KEY` and any future provider credential.

The gateway must not generate candidates, select a winning route, calculate recommendation scores, call DeepSeek, or persist participant identity.

### Amap

Amap is called directly from the Next.js server-side city provider. It does not pass through the travel gateway. `AMAP_API_KEY` remains server-only.

The built-in city library remains the source of truth for city codes, coordinates, hub flags, candidate generation, and scoring. Amap improves input quality but does not introduce unsupported cities into recommendation calculations.

### DeepSeek

DeepSeek retains its existing post-calculation boundary. Only already computed recommendation values may be sent for explanation. It cannot mutate tickets, candidates, selected routes, scores, or ordering.

## City Search And Validation

City search is local-first:

1. Search the built-in city library immediately.
2. If local results are insufficient, call Amap from `/api/cities/search` on the server.
3. Validate and normalize the Amap response.
4. Match each Amap result back to a supported built-in city.
5. Return only supported normalized cities for selection.

An Amap result that cannot be mapped to the local library may be shown as unsupported, but it must not enter candidate generation or scoring. Amap timeout, quota failure, invalid data, or missing credentials falls back to local search without breaking the form.

## Travel Query Data Flow

1. The main application reads the meeting date, target arrival time, participants, accepted transport modes, and enabled candidate cities.
2. It creates and deduplicates searches by origin city, candidate city, meeting date, transport mode, and filter-version identifier.
3. It sends authenticated normalized requests to the travel gateway.
4. The gateway maps modes as follows:
   - `flight` to FlyAI `search-flight`;
   - `high_speed_rail` to FlyAI `search-train`, retaining only high-speed and electric multiple-unit services;
   - `normal_train` to FlyAI `search-train`, excluding those high-speed categories.
5. The gateway normalizes valid results into the application's `TravelOption` contract.
6. The main application retains only options that:
   - depart on the meeting date in the applicable China-local time context;
   - arrive no later than the target arrival time;
   - match the participant's accepted modes;
   - contain valid prices, timestamps, durations, and route identity.
7. For each participant and candidate city, the application selects exactly one feasible option through the existing deterministic selection formula.
8. Failed or empty searches produce estimated fallback options where an estimate is possible.
9. Scoring aggregates one selected option per participant and preserves the existing cheapest, balanced, and fastest recommendation model.

The provider's ordering and recommendation labels are ignored. FlyAI supplies inventory facts, not product decisions.

## Normalized Data Contract

The existing `TravelOption` remains the main domain boundary. Add a required nullable `queriedAt` field to both the domain model and persisted travel option data:

- real provider option: ISO timestamp from the gateway's successful query;
- estimated option: `null`;
- unavailable option: `null`.

Provider results may populate:

- `priceCny`;
- `departAt` and `arriveAt`;
- `durationMinutes`;
- `isDirect`, `hasTransfer`, and `transferCount`;
- `serviceName` for flight number or train number;
- `bookingUrl` when supplied and validated;
- `source` and `provider`;
- `queriedAt`.

Unknown fields are ignored. Invalid required fields cause that provider item to be rejected. Raw provider payloads are not persisted.

## Caching, Concurrency, And Time Budgets

- Cache normalized searches by origin, destination, date, mode, and filter version.
- Initial cache TTL: 5 minutes.
- Preserve the existing 30-minute result staleness rule.
- Deduplicate identical searches within one recommendation calculation.
- Initial gateway concurrency limit: 4 FlyAI calls.
- Per-call timeout: 12 seconds.
- Retry at most once for retryable timeouts and transient provider failures.
- The calculation orchestration must enforce an overall time budget. Searches unfinished at that boundary fall back to estimates so the user is not left waiting indefinitely.
- Cache data contains route facts only and excludes participant names and identifiers.

The exact overall calculation timeout is set during implementation after the real capability probe measures typical and tail latency; it must be explicitly configured, tested, and documented rather than left implicit.

## Error Handling And User Experience

### Partial failure

A failed single search falls back to an estimate without discarding successful real searches. A candidate with mixed data remains rankable and displays a visible `部分数据为估算` indicator.

### Provider-wide or gateway failure

If FlyAI or the gateway is unavailable, the calculation completes in estimated mode and tells the user: `实时票价暂不可用，当前按估算数据生成建议`.

### No feasible shared city

If every candidate lacks a feasible same-day route for at least one participant, the application must not fabricate a top recommendation. It displays: `按当前到达时间，没有找到全员可行城市` and guides the organizer to change the arrival time or meeting date.

### Result presentation

- Real route: show `飞猪参考价`, its query time, and a source indicator.
- Estimated route: show `估算`; do not show a booking action.
- Valid booking URL: show `去飞猪查看` and `价格和余票以跳转页面为准`.
- Missing or invalid booking URL: keep the route usable without a broken action.
- Recalculation: tell the user that real fares are being queried; automatically finish with partial fallback when some searches time out.

## Security And Privacy

- `AMAP_API_KEY` exists only in the Next.js server environment.
- `FLYAI_API_KEY` exists only in the gateway environment.
- The application and gateway use a separate service-to-service secret.
- CLI execution passes an executable plus an argument array and never interpolates a shell command string.
- Gateway inputs are schema-validated and restricted to supported cities, ISO dates, known modes, and bounded filters.
- Booking URLs are accepted only for approved HTTPS hosts or a documented safe redirect pattern.
- Logs exclude keys, authorization headers, raw provider responses, participant names, and booking-link tracking parameters.
- Provider outputs pass strict schema validation before entering scoring.

## Delivery Phases

### Phase 1: capability and authorization probe

- Obtain Amap Web Service and FlyAI keys.
- Run fixed, representative flight and train searches.
- Verify field availability, data quality, booking links, quota behavior, latency, and error shapes.
- Record only redacted schemas and aggregate observations.
- Confirm that small-public-beta use is permitted.

This is a hard production gate. If data or authorization is insufficient, retain estimated travel instead of scraping Fliggy pages or depending on undocumented internal endpoints.

### Phase 2: Amap integration

- Implement local-first remote-assisted city search.
- Add validation, timeout, and local fallback.
- Verify municipalities, duplicate names, district input, unsupported cities, missing keys, and quota failures.

This phase may ship independently.

### Phase 3: gateway and application integration

- Update `AGENTS.md` before adding the new service directory.
- Add the container-compatible Node.js gateway and FlyAI CLI adapter.
- Add authentication, validation, cache, concurrency, timeouts, retry, and error mapping.
- Replace the application FlyAI shell with an HTTP gateway client.
- Add `queriedAt` persistence and source/freshness UI.
- Preserve deterministic selection, scoring, and fallback.

### Phase 4: small public beta

Monitor:

- real-data hit rate;
- estimate-fallback rate;
- P95 gateway and calculation latency;
- provider error and timeout rates;
- booking-link validity;
- daily calculation volume and quota consumption.

If quota or stability limits are reached, provide explicit rate-limit feedback and fall back safely. Never silently substitute incorrect real prices.

## Testing And Acceptance

### Unit and contract tests

- Amap response normalization and local mapping.
- FlyAI response schema validation and normalization.
- flight, high-speed rail, and normal-train classification.
- meeting-date and arrival-deadline filtering.
- gateway error-code mapping.
- application-to-gateway request and response schemas.
- deterministic route selection and ranking for identical normalized input.

### Failure and security tests

- missing credentials;
- provider timeout and retry exhaustion;
- invalid and empty JSON;
- partial route failure;
- provider-wide and gateway-wide failure;
- command-injection-shaped input;
- secret and log redaction;
- invalid or unsafe booking URLs.

### End-to-end tests

- create a plan and add multiple participants;
- query real routes through the gateway;
- generate mixed real and estimated recommendations;
- show query-time reference-price language;
- open a valid FlyAI booking link;
- fall back without blocking when external services fail;
- show the no-feasible-shared-city state instead of a fabricated recommendation.

### Completion verification

Run the project-required commands:

- `npm run lint`
- `npm run test`
- `npm run build`

The gateway must also provide and pass its own lint, test, and production-build commands. Real-provider smoke tests output only statuses, counts, latency summaries, and redacted samples; they never print secrets or complete provider payloads.

## Out Of Scope

- booking, checkout, payment, order management, refunds, or ticket locking;
- a guarantee that displayed price or inventory remains available;
- previous-day departure, hotels, or accommodation cost;
- browser scraping or reverse engineering undocumented Fliggy endpoints;
- DeepSeek-generated candidates, route choices, scores, or rankings;
- replacing the local city library with Amap as the scoring source of truth;
- production scale beyond the initial 50-500 daily calculations before beta evidence and formal provider limits are reviewed.

## Success Criteria

- Supported city input improves through Amap without making city search dependent on Amap availability.
- Real flight and train options can flow through the isolated gateway into the existing normalized model.
- Every displayed real price includes source and query-time context.
- Partial and total external failures preserve a usable, honestly labeled result.
- Identical normalized inputs produce identical selected routes and recommendation ordering.
- DeepSeek remains unable to influence candidate generation or ranking.
- The provider adapter can move from FlyAI CLI/MCP to a formal API without changing product scoring or the main application contract.
