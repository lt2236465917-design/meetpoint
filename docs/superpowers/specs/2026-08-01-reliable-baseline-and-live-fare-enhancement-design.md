# Reliable Baseline City And Live-Fare Enhancement Design

**Status:** approved by explicit operator authorization on 2026-08-01. This specification changes the former product boundary that withheld every city until real-fare coverage was complete. It does not weaken any real-fare publication guard.

## Problem and verified incident

A valid plan can currently end with no useful city because supplier collection is the only path to a recommendation. Production run `8415551d-4f43-4b4e-ab8e-be750159e49d` created 96 route tasks and zero verified quotes; every task ended `terminal_failure / PROVIDER_INVALID_RESPONSE` after one attempt. A minimal FlyAI 1.0.16 reproduction returned exact Chinese transport enums (`飞机`, `火车`), while the adapter accepted only `flight` and `train`, so otherwise usable rows were dropped as `mixed_transport_category`.

The product has two different claims and must represent them separately:

1. **Baseline meeting city (must return):** deterministic output from canonical departure coordinates plus the repository-owned meeting-hub catalog. It is a planning starting point, not a ticket-price conclusion.
2. **Live-fare enhancement (conditional):** saving and fast schemes backed by complete, current, verified quotes for every participant.

## Product contract

- A valid automatic plan with at least two canonical participants receives one baseline city as soon as its run matrix is created.
- Show the city conclusion first. Beneath it, progressively disclose that real fares are being collected.
- While coverage is incomplete or failed, keep the baseline city visible and say that fares are not yet confirmed. Do not show price totals, route rows, booking links, saving/fast labels, or technical provider codes.
- Saving/fast cards appear only for the completed, current, non-superseded supplier-backed result. Their existing transaction, database policy replay, and evidence constraints remain unchanged.
- Alternative previews remain supplier-backed and private; this design does not convert a baseline into a host-confirmable alternative.

## Deterministic baseline policy

Policy version: `2026-08-01.baseline.v1`.

Inputs are canonical participant identities with coordinates, manual candidate additions/exclusions, and the built-in meeting-city catalog. Amap departures are valid origins but never become meeting candidates merely because they are origins.

1. Resolve every participant to canonical longitude/latitude. Built-in cities use repository coordinates. `amap-*` identities use coordinates returned by the server-side Amap administrative-district resolver and persisted at participant creation. Missing canonical coordinates fail participant creation or baseline creation with actionable retry guidance; they never silently fall back to Wuhan or a national default.
2. Compute the arithmetic geographic midpoint of all participant coordinates.
3. Form the bounded candidate set from manual additions plus built-in airport/rail/provincial/municipality hubs, excluding manual removals. Departure cities may enter only when they are built-in meeting candidates.
4. Rank candidates by `haversineKm(midpoint, candidate) - hubBonus`, using the existing explicit hub weights. Break ties by city code. The first candidate is the baseline.
5. Persist the selected city, policy version, evidence level, and input fingerprint with the automatic run so reads do not change when catalogs evolve. No supplier fact enters this selection.

Evidence levels:

- `canonical_coordinates_and_hubs`: all origins have server-verified canonical coordinates and the winner comes from the bounded built-in hub catalog.
- Future reachability levels require a versioned, deterministic repository-owned reachability dataset. Supplier absence alone cannot be interpreted as unreachable.

The baseline explanation is fixed product copy describing geographic/hub evidence. It must never say cheapest, fastest, best fare, bookable, or guaranteed reachable.

## Live supplier resilience

- FlyAI transport classification uses an exact allowlist only: flight is `flight` or `飞机`; train is `train` or `火车`. Substrings, combined labels, fuzzy translations, and unknown values remain rejected.
- Connecting itineraries still require a complete ordered segment set, consistent requested mode, valid elapsed time, at most eight segments, and complete price/service facts.
- A deploy-time live contract canary must execute the same adapter normalization path as production and emit only provider name, stable status, mode, counts, latency, and allowlisted reason categories. It must never log keys, raw rows, route facts, fares, stations, service identities, URLs, or timestamps.
- `PROVIDER_INVALID_RESPONSE` is permanent for the same request. The gateway does not blindly retry it. Repeated equal schema-drift signatures open a bounded process-local circuit, causing later searches to fail fast with the same stable public code. The circuit automatically closes after its TTL and successful normalization resets the signature counter.

## Task order and evidence completeness

Route tasks are ordered candidate-first, then participant-interleaved, then mode/date. This reaches a first fully covered city without exhausting every route for participant one. It does not change the evidence needed for any claim: a city becomes eligible for saving/fast only after every participant has at least one valid quote and deterministic policy replay succeeds.

## Secondary provider boundary

Secondary supply is a real capability only when an adapter implementation and its required configuration are both present. The orchestrator receives a capability object rather than a hard-coded boolean. Health routing may select the secondary adapter after a primary failure, but the same normalized contract, diagnostics redaction, quote provenance, cache freshness, and publication guards apply. This repository must not invent a provider or claim failover when no commercial integration is configured.

Persisted cache entries include provider provenance and `queriedAt`. Expired entries may reduce provider load internally but cannot be published or presented as current live fares.

## DeepSeek transport rollout

`deepseek-v4-flash` is the model identity for both supported transports. Moving from Chat Completions to Responses API changes the request/response protocol, not the model or the deterministic publication authority.

- `chat_completions` is the stable default and rollback path. `responses` is a candidate transport until paired credentialed evidence clears the rollout gate below.
- Both transports remain behind the provider-neutral `AgentModel` interface and share the same serialized input safety checks, concrete Zod-derived JSON schema, output key preservation, local schema parsing, 15-second SDK timeout, one retry only for `MODEL_INVALID_OUTPUT`, and stable `MODEL_TIMEOUT` / `MODEL_UNAVAILABLE` mapping.
- `DEEPSEEK_TRANSPORT=chat_completions|responses` selects the server-only primary path. Missing means `chat_completions`; unknown values fail closed. The API key and selector never enter browser bundles, logs, fixtures, or public diagnostics.
- Responses uses only DeepSeek-documented stateless fields: `model`, `instructions`, `input`, `max_output_tokens`, `reasoning.effort=none`, and `text.format`. Provider-compatible simple object schemas use remote `json_schema` strict mode. DeepSeek currently rejects the calculation/supervisor top-level union schemas with HTTP 400, so those use remote `json_object` mode while the unchanged concrete Zod schema, unknown-key preservation check, parse, and invalid-output retry remain mandatory locally. This is protocol compatibility, not a validation downgrade: no value reaches an agent without passing the same exact local schema. The adapter does not send or depend on `previous_response_id`, `conversation`, `store`, `background`, tools, metadata, or silently ignored compatibility fields. Responses currently supports `deepseek-v4-flash`, not `deepseek-v4-pro`.
- Neither transport receives supplier credentials, raw provider payloads, participant names, booking URLs, database clients, tools, candidate-generation authority, or publication authority. `SAFE_EXPLANATIONS_ZH`, the trusted-model allowlist, calculation/supervisor validators, verified evidence, policy replay, and transaction guards remain unchanged.

Optional runtime shadowing is read-only and off by default:

- `DEEPSEEK_SHADOW_TRANSPORT=off|chat_completions|responses`, `DEEPSEEK_SHADOW_SAMPLE_RATE`, `DEEPSEEK_SHADOW_MAX_CONCURRENCY`, `DEEPSEEK_SHADOW_MAX_CALLS_PER_PROCESS`, and `DEEPSEEK_SHADOW_MAX_TOTAL_TOKENS_PER_PROCESS` bound sampling, concurrency, and spend. Unknown/invalid values fail closed; the shadow transport must differ from the primary.
- The primary result alone is returned to the agent and alone may affect proposals, `agent_events`, run state, or shared results. Shadow failures never trigger a primary retry or state transition. Setting the shadow transport to `off` or the sample rate to `0` is the immediate kill switch.
- Shadow telemetry contains only transport, allowlisted agent name, schema-qualified outcome, downstream qualification category when the offline comparison harness runs the agent validator, latency bucket/milliseconds, aggregate token counters, retry count, and stable error code. It never records prompts, serialized inputs, participant facts, raw responses, parsed proposals, trace IDs, or credentials.
- A separate credentialed production-like comparison command runs paired calls with identical safe input and schema, then emits only aggregate redacted metrics for schema validity, calculation proposal qualification, supervisor qualification, latency, token/cost proxy, timeout, retry, and error mapping. It has no repository or Supabase writer.

The Responses primary may be enabled only after at least 100 paired production-like calls, including at least 30 calculation and 30 supervisor calls, satisfy all of these predeclared gates:

1. zero prompt/response/participant leakage and zero shadow business-state writes;
2. schema-qualified rate at least 99% and no more than 1 percentage point below Chat Completions;
3. calculation proposal and supervisor qualification rates each at least 98% and no more than 1 percentage point below Chat Completions;
4. combined timeout/unavailable rate no more than 1 percentage point above Chat Completions, with unchanged stable error mapping and one invalid-output retry;
5. p95 latency below 15 seconds and no more than 1.25× Chat Completions;
6. average total tokens, and the cost computed from the then-current official price table, no more than 1.25× Chat Completions unless the operator explicitly accepts the measured tradeoff.

If any gate lacks evidence, delivery status is “capability integrated; default unchanged.” Switching is an environment-only change and rollback is one environment change back to `chat_completions`; no migration or git push is required.

## Data and security boundaries

- Persist participant coordinates only after server-side canonical identity resolution. Client-supplied coordinates are assertions and are never trusted.
- Persist baseline facts independently from `recommendation_results`, `recommendation_schemes`, and `recommendation_scheme_routes`; those tables continue to mean complete verified live evidence.
- Public reads expose only the baseline city name, policy/evidence label, and safe copy. Amap request details and raw provider facts remain server-only.
- Existing `(participantId, quoteId)` evidence identity, transaction materialization, deterministic policy replay, accepted-mode/date checks, current-result ownership, RLS, and private-preview boundaries remain mandatory.

## Acceptance

- Exact Chinese FlyAI flight/train enums normalize; ambiguous or mixed enums remain rejected.
- A redacted canary fails when the production normalization contract drifts.
- Repeated equal invalid-response signatures are bounded rather than fanning out across the matrix.
- Candidate ordering is candidate-first and participant-interleaved.
- Built-in and `amap-*` canonical origins influence baseline ranking; no default midpoint substitutes for unknown origins.
- In incomplete/failed live states the UI shows the baseline city first, no fare/scheme/route claims, and a clear retry next step.
- Complete live coverage still passes all database publication guards before saving/fast cards appear.
- Chat Completions and Responses receive the same safe input and concrete output schema through the same `AgentModel` validation/retry/error boundary.
- Unknown primary/shadow transport configuration fails closed; default and rollback remain Chat Completions.
- Shadow mode is sampled and capped, emits only redacted aggregate telemetry, and cannot persist proposals, agent events, run state, or results.
- Responses cannot become the default without the predeclared credentialed paired-call gate; absent evidence is reported as not switched.
