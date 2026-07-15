# Multi-Agent Recommendation Product And Architecture Design

**Status:** Approved design; implementation has not started

**Date:** 2026-07-15

## Authority And Migration Status

This specification defines the next product and architecture version. It supersedes conflicting product decisions in earlier MVP specifications about target arrival time, estimated recommendations, three result cities/cards, and explanation-only LLM use. Earlier specifications and plans remain unchanged as historical implementation records.

The current code still uses a target arrival time, deterministic three-label ranking, and estimated fallback rows. `README.md`, `docs/architecture.md`, and `docs/integration-guide.md` continue to describe that deployed behavior until this design is implemented and accepted. Do not describe this target architecture as live before then.

## Product Goal

Help 2–6 people choose one cross-city meeting destination using real, traceable ticket facts. The system absorbs supplier complexity, retries incomplete searches, and returns a shared result only when every participant has a real feasible route.

The product remains a structured mobile-first H5 form. Natural-language plan input is out of scope.

## Confirmed Product Rules

### Plan input

- The form asks for a planned arrival date, not a target arrival time.
- A route is feasible when its China-local arrival date equals the selected arrival date.
- The participant continues choosing a departure city and accepted transport modes.
- Flight searches cover the arrival date and the previous date.
- High-speed-rail searches cover the arrival date and the previous date.
- Normal-train searches cover the arrival date and the previous two dates.
- Departure-day expansion is an internal system behavior; the user does not choose or manage it.

### Real-data publication rule

- Final recommendations may use only verified real quotes returned by the supplier boundary.
- Estimated fares may not fill missing coverage, influence the winning city, or appear inside published saving/fast schemes.
- Every participant must have a feasible real route before a candidate city can be ranked.
- If coverage remains incomplete, the run stays incomplete and the system performs allowed recovery actions. It must not publish a plausible-looking partial recommendation.
- Persistent supplier failure is reported as a result-generation state with a retry/recovery action, not as estimated ticket cards.

### Result shape

- The shared result contains exactly one recommended city.
- That city contains exactly two schemes: `saving` and `fast`.
- Each scheme shows one selected route per participant, team total fare, travel duration, transfer information, and quote freshness/evidence.
- The UI does not show average fare as a decision metric.

### Alternative city flow

- A participant who dislikes the recommended city may search any supported city and request a recalculated preview.
- Any participant may create a private preview.
- Only the host may confirm that preview as the latest shared result.
- Initial automatic calculation may publish after Supervisor approval; replacing it with a participant-selected city requires host confirmation.

## Recommendation Policy

The Calculation Agent owns route comparison, scheme construction, and the final city proposal. It may use only verified quote records and must cite every selected `quote_id`. Deterministic tools independently verify arithmetic, dates, evidence, and publication invariants.

### Direct-first eligibility

For each participant, city, and scheme:

1. Consider feasible direct routes first.
2. Consider transfer routes only when no feasible direct route exists.
3. Never trade a feasible direct route for a transfer merely because the transfer is cheaper or faster.

### Saving scheme

For each participant, find the lowest fare inside the direct-first eligible set. Admit routes priced at no more than 110% of that minimum, then choose by:

1. fewer transfers;
2. shorter duration;
3. lower fare;
4. stable quote identifier as the final reproducible tie-break.

The team saving scheme consists of the selected route for every participant. Its fare is the exact sum returned by the arithmetic validator.

### Fast scheme

Construct combinations only from direct-first eligible routes. A combination is price-eligible when its team total fare is no more than 130% of the saving scheme total. Choose by:

1. lowest team total duration;
2. earliest latest-participant arrival time;
3. fewer team transfers;
4. lower team total fare;
5. stable ordered quote identifiers as the final reproducible tie-break.

### Unique city

Only cities with complete real coverage enter ranking. The Calculation Agent proposes one city using the city’s selected saving scheme:

1. lowest team total fare;
2. more direct participant routes;
3. smaller participant fare fairness gap;
4. lower team total duration;
5. stable city code as the final tie-break.

The prompt expresses this policy, while the Supervisor and deterministic validators reject proposals that violate it. The model may not introduce hidden weights or substitute an intuitive notion of “value”.

## Agent Architecture

### Manager Agent

The Manager includes the former Requirements Agent responsibilities. It:

- reads the structured plan form;
- validates that required participant inputs exist;
- generates the candidate and route-task matrix;
- delegates bounded work to specialist agents;
- tracks run state and decides which allowed stage runs next;
- owns the final user-facing workflow, but not supplier facts or publication bypasses.

### Query Agent

Query Agents execute bounded route tasks through ticket tools. They:

- query flight or train facts for one normalized task;
- preserve supplier `quote_id`, query timestamp, service identity, price, and schedule;
- return structured success, empty, retryable failure, or terminal failure states;
- never estimate prices or select the winning city.

### Calculation Agent

The Calculation Agent replaces the proposed Recommendation Engine Tool. It:

- reads verified quotes and coverage state;
- requests targeted missing-route queries when required;
- applies the direct-first, saving, fast, and unique-city policies;
- returns a structured proposal containing one city, two schemes, selected quote IDs, comparison evidence, and reasons;
- calls the arithmetic and evidence validators before submission;
- cannot modify supplier facts or publish its own proposal.

The implementation must expose the model behind a provider-neutral `AgentModel` interface. DeepSeek may be the first provider, but workflow state and contracts must not depend on a DeepSeek-specific SDK shape.

### Supervisor Agent

The Supervisor reviews coverage and the Calculation Agent proposal. It:

- detects missing or prematurely completed route tasks during collection;
- checks all participant/date/source/quote invariants before publication;
- rejects unsupported selected routes, incorrect totals, hidden estimates, wrong dates, extra cities, or extra schemes;
- returns bounded correction instructions or approves publication.

Supervisor approval is necessary but not sufficient: deterministic publication guardrails must also pass.

### Fallback Agent

The Fallback Agent handles only allowed recovery actions:

- retry after the gateway-provided cooldown;
- rerun a missing route/date/mode task;
- use another configured supplier adapter behind the same gateway contract;
- stop and return an incomplete run when retry policy is exhausted.

It may not invent a quote, relax the arrival date, enable an unaccepted mode, or convert an estimate into a real fact.

## Tool Surface

Tools provide facts, exact validation, state transitions, and controlled side effects. They do not choose the product recommendation.

### Ticket facts

- `query_flight_quotes`
- `query_train_quotes`
- `get_verified_quotes`

### Deterministic validation

- `sum_fares`
- `validate_arrival_date`
- `validate_quote_evidence`
- `validate_recommendation_policy`

### Workflow and publication

- `get_run_coverage`
- `save_agent_proposal`
- `publish_shared_result`

Every tool uses a strict schema, bounded timeout, stable error mapping, and trace identifier. Ticket tools remain behind the travel gateway, which continues owning supplier credentials, CLI/MCP execution, caching, retries, cooldown, response normalization, and secret-safe logging.

## Execution Model

Execution is hybrid rather than fully serial or fully parallel:

1. Manager runs serially to validate input and create tasks.
2. Independent Query Agent tasks are logically parallel and enter a code-controlled concurrency pool.
3. The physical supplier concurrency remains constrained by gateway policy. With the current FlyAI evidence, actual supplier calls remain globally serial; logical parallelism must not bypass that limit.
4. Supervisor monitors coverage while collection is running and may trigger targeted Fallback work.
5. Calculation starts only when the required verified coverage snapshot is complete.
6. Supervisor and deterministic guardrails validate the proposal serially.
7. Publication is the final serial state transition.
8. A rejected proposal or missing coverage loops only the affected tasks, not the entire run.

Concurrency limits are code configuration informed by provider evidence. An LLM may not spawn unbounded supplier calls or override cooldowns.

## Calculation Agent Contract

The Calculation Agent receives:

- plan and participant identifiers without unnecessary personal data;
- selected arrival date;
- candidate cities;
- accepted modes;
- verified normalized quotes;
- coverage and retry state;
- policy version.

It returns strict structured output containing:

- `status`: `proposal` or `incomplete`;
- one `city_code` when status is `proposal`;
- exactly one `saving` scheme and one `fast` scheme;
- one selected `quote_id` per participant per scheme;
- validator-produced fare totals;
- missing task identifiers when incomplete;
- policy comparison evidence;
- a Chinese explanation that cites no facts outside the structured input.

Core system-prompt constraints:

- use only verified quotes;
- never estimate, infer, or edit prices and schedules;
- require selected arrival-date equality in China local time;
- require complete participant coverage;
- apply direct-first and the explicit 110%/130% policies;
- cite every selected quote ID;
- call validators for arithmetic and evidence;
- return `incomplete` instead of fabricating a result.

## State And Publication Guardrails

Recommended run states are:

- `pending`
- `collecting`
- `cooling_down`
- `calculating`
- `validating`
- `awaiting_host_confirmation` for an alternative-city preview
- `completed`
- `incomplete`
- `failed`

Recommendation cards and the shared result entry appear only for a `completed` run. Publication requires all of the following:

- every participant is represented in both schemes;
- every selected route references an existing verified real quote;
- every arrival date matches the selected date in `Asia/Shanghai`;
- fare sums exactly match validator output;
- saving and fast policies pass deterministic validation;
- exactly one city and two schemes exist;
- the Supervisor approved the same proposal version;
- host confirmation exists when replacing the shared result with an alternative-city preview.

## Failure Experience

- While collecting or cooling down, show actionable progress such as which route groups remain and when the next allowed retry begins.
- Do not show `GATEWAY_UNAVAILABLE` as if it were a ticket result.
- If recovery is exhausted, state that no recommendation has been generated because real ticket coverage is incomplete. Preserve a retry action and diagnostic run ID.
- `/healthz` remains process reachability only and cannot prove supplier recovery or ticket coverage.

## Security And Observability

- Supplier and model credentials remain server-side.
- Agent prompts and traces exclude secrets, raw provider payloads, and unnecessary participant identity.
- Every agent turn, tool call, proposal version, validator decision, retry, and publication transition receives a traceable run ID.
- Store normalized quote evidence and policy version so a published decision can be replayed and audited.
- Do not log full booking URLs, authorization headers, or supplier text that may contain sensitive data.

## Acceptance Criteria

1. The create form no longer asks for a target arrival time and submits the arrival date contract.
2. Query-date expansion and China-local arrival-date filtering are covered by automated tests for flights, high-speed rail, normal trains, and overnight journeys.
3. A completed result contains one city and exactly two schemes.
4. Saving-policy tests cover the 110% range, direct-first behavior, transfers, duration, and stable ties.
5. Fast-policy tests cover the 130% team cap, duration, latest arrival, transfers, and stable ties.
6. Missing or estimated quotes can never pass publication guardrails.
7. Calculation Agent outputs are strict, evidence-linked, and rejected when they violate policy.
8. Query work uses bounded concurrency and respects gateway serial/cooldown controls.
9. Alternative-city previews remain private until host confirmation.
10. Identical verified quote fixtures and policy versions produce validator-equivalent published facts even if explanation wording differs.
11. Root application and gateway lint, test, and build commands pass.
12. Real-device acceptance verifies the remaining native date picker and the full create-to-result flow.

## Out Of Scope

- natural-language plan input;
- estimated recommendations;
- three-city or balanced-result presentation;
- booking, payment, ticket locking, or inventory guarantees;
- hotel or return-trip costs;
- allowing an agent to bypass gateway limits, deterministic validation, host confirmation, or publication state transitions.

## Required Next Step

Create a reviewed implementation plan from this specification before modifying product code. The plan must separate schema/API migration, agent runtime and tools, query scheduling, Calculation/Supervisor policy validation, UI migration, historical data handling, tests, and live acceptance.
