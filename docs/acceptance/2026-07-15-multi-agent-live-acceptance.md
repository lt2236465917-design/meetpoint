# Multi-Agent Live Acceptance — 2026-07-15 Gate

This record covers the Task 14 release gate. It contains no secrets, authorization headers, participant identities, raw provider output, fares, service numbers, or booking URLs.

## Verdict

**Pass — Task 14 closed with operator-waived credential rotation.** Real Supabase migration, guarded RPC smoke, supplier evidence, physical-phone H5 checks including first host confirmation, automated gates, final code review, and one fresh post-fix Calculation/Supervisor guarded publication pass. On `2026-07-17`, the operator explicitly declined Dashboard rotation of the exposed Supabase secret key and database password and chose to keep the existing local server-only `.env.local` credentials. That residual risk is accepted by the operator; it is not claimed as completed rotation.

## Evidence Metadata

- Recorded at: `2026-07-16 23:40 CST` (gate evidence); operator waiver recorded `2026-07-17`
- Evidence base commit: `542713a` (invalid-output retry, review persist retry, winning-city scheme canonicalize)
- Desktop host: macOS local development environment
- Automated browser: Codex in-app browser; Chromium version was not exposed
- Real phone/device: physical phone on the same LAN; browser/version was not exposed

## Automated Quality Gates

| Check | Result | Evidence |
| --- | --- | --- |
| Root lint | PASS | `npm run lint`, exit code 0 |
| Root tests | PASS | Final suite: 57 files, 325 tests. |
| Root production build | PASS | Final post-device-fix build passed outside the sandbox, including TypeScript and static-page generation. The route manifest contains no legacy explain endpoint. |
| Gateway lint | PASS | `npm run lint`, exit code 0 |
| Gateway tests | PASS | Final suite: 7 files, 90 tests. |
| Gateway build | PASS | `npm run build`, exit code 0 |
| Legacy static guard | PASS | `tests/no-legacy-recommendation-path.test.ts` scans production file paths and contents; no estimate, weighted three-city, target-time, partial-estimate, or explain-only path remains. |

## PostgreSQL And Supabase Migration Smoke

Status: **PASS**.

- An operator-approved Supabase project was configured locally without committing credentials. The empty test schema was explicitly reset, then all six repository migrations were executed in one SQL transaction through the Supabase SQL Editor.
- The first live attempt exposed a fresh-install chain defect: the repository lacked its historical baseline migration and retained the legacy non-null host-token column. The chain now starts with `202607080001_initial_schema.sql`; the Multi-Agent migration copies legacy host hashes into `plan_credentials` before dropping the old column.
- The corrected migration transaction completed successfully. A rollback-safe service-role RPC smoke returned `RPC_SMOKE_PASS`: public roles were rejected, automatic publication passed, an invalid host was rejected, valid host confirmation passed, and smoke data was rolled back.
- A final read-only parity query passed all nine checks: required tables, removed legacy columns, both guarded RPCs, four Realtime publication tables, and RLS on all nine Multi-Agent tables.

## Fixed Supplier Coverage Plan

Status: **PASS** — supplier matrix coverage, quote persistence, and a fresh post-fix guarded publication on `542713a` are proven (plan `VXYI6G` / run `93e7ad8c-1e15-4a3b-905f-c5fb67b02c45`: two schemes, six same-run quote routes). Earlier successful publication that used temporary preselected-winner wiring is retained only as historical evidence.

- No direct gateway probe was counted. Early diagnostic runs used new three-participant plans persisted in Supabase, with flight, high-speed rail, and normal-train participants. Each matrix contained 84 route tasks: 24 flight, 24 high-speed rail, 36 normal train, including 48 previous-day tasks.
- Run `a2197d4e-b3bb-457c-80d1-4839a73c8919` stored 85 verified quotes (26 flight, 44 high-speed rail, 15 normal train), including 20 previous-day and 20 overnight-arrival quotes. All three participants and one complete candidate city were covered. Task outcomes were 18 succeeded, 12 empty, 10 terminal `PROVIDER_INVALID_RESPONSE`, and 44 not needed after complete coverage; no cooldown timestamps occurred. Calculation then failed because the DeepSeek JSON-output request omitted the required JSON instruction.
- The adapter now supplies an explicit JSON instruction and format examples, sets a 4096-token response budget, and disables DeepSeek V4 thinking through the top-level OpenAI-format `thinking` field. A redacted diagnostic against the persisted quote shape returned `finish_reason=stop`, parseable JSON, and a schema-valid five-field Calculation result.
- Run `e1c5009b-d4f3-4151-a674-b181a0d6e7f5` stored 50 verified quotes (25 flight, 11 high-speed rail, 14 normal train), including 14 previous-day and 14 overnight-arrival quotes. All three participants and one complete candidate city were covered. Task outcomes were 12 succeeded, 11 empty, 9 terminal `PROVIDER_INVALID_RESPONSE`, and 52 not needed after complete coverage; no cooldown timestamps occurred.
- The second run reached Calculation and completed its first model request, but the model returned an `incomplete` proposal despite controlled complete coverage. Deterministic validation rejected it with `INVALID_PROPOSAL`; the correction attempt produced invalid output and the run failed closed with `RUN_ADVANCE_FAILED`.
- Complete coverage is explicit through empty `missingTaskIds` in Calculation model input, and the prompt requires `proposal` when `missingTaskIds=[]`. The removed `coverageComplete` and `deterministicPolicyResult` fields must not return to model input. Run `cbeb2fa0-2f4d-4184-b82f-a7ca90f855fe` then stored 92 verified quotes across all three modes, including 11 previous-day and one overnight-arrival quote, and reached Calculation with all participants plus one complete city. Its one model request returned invalid output before proposal persistence; the run failed closed with `RUN_ADVANCE_FAILED`. Two subsequent redacted diagnostics using the exact persisted input shape and quote ordering returned parseable, schema-valid proposals whose participant mappings referenced only supplied quote IDs.
- Run `0d33a0a7-0b13-47f9-9c43-eb8352c5389f` stored 72 verified quotes across all three modes, including 13 previous-day and four overnight-arrival quotes, with all participants plus one complete city. Both Calculation attempts returned schema-valid proposals, but deterministic validation rejected both with `POLICY_MISMATCH` and `TOTAL_FARE_MISMATCH`; no Supervisor model approval or publication occurred.
- Root cause at the time: Calculation validated model output against `rankEligibleCities` while free-form generation repeatedly produced unsupported route selection or fare arithmetic. A temporary `deterministicPolicyResult` input enabled the successful live publication below, but final review found that preselecting the exact recommendation crossed the approved agent/tool authority boundary. That temporary wiring was removed; Calculation again proposes from verified candidate facts and independent deterministic policy replay remains decisive.
- The first two fresh runs after that wiring change did not reach Calculation. Run `b0f611b1-5ccb-4cd5-a535-83d9edc5765e` encountered four `PROVIDER_RATE_LIMITED` outcomes, stored 12 quotes for only two participants, and ended `incomplete`. After an additional two-minute wait, run `6d083b88-c1b1-4786-a1d7-d80404503d6d` again received four `PROVIDER_RATE_LIMITED` outcomes, stored no quotes, and ended `incomplete`. Both failed closed with `REAL_QUOTE_COVERAGE_INCOMPLETE`; repeated immediate supplier attempts stopped at this point.
- After supplier recovery, run `c0b65e58-b6c7-4e2b-aea2-abfbb20dbe99` completed through Calculation, Supervisor, and guarded publication. It stored 95 verified quotes: 55 flight, 23 high-speed rail, and 17 normal train, including 22 previous-day and five overnight-arrival quotes. All three participants and one complete candidate city were covered. Task outcomes were 20 succeeded, 19 empty, nine terminal `PROVIDER_INVALID_RESPONSE`, and 36 not needed after complete coverage.
- Proposal version 1 passed deterministic validation and Supervisor review. The shared result contains exactly two schemes (`saving`, `fast`) and exactly six route rows, three participants per scheme. Every `recommendation_scheme_routes.verified_quote_id` references a `verified_quotes.id` from this same run.
- Final-code attempt `30ab6641-a1a7-4bed-9360-492a5402f1f2` stored 77 verified quotes across all three modes, including 23 previous-day and 23 overnight-arrival quotes, and reached all three participants, but no candidate city covered every participant. Four tasks ended `PROVIDER_RATE_LIMITED`; the bounded recovery entered cooldown and then terminated `incomplete` with `REAL_QUOTE_COVERAGE_INCOMPLETE`.
- A later attempt that hit `GATEWAY_UNAVAILABLE` before any quotes were stored is not counted as supplier coverage: both the Next.js app and `services/travel-provider-gateway` on `TRAVEL_GATEWAY_URL` must be reachable before a live publication attempt.
- After the gateway was confirmed healthy (`GET /healthz` → `{ "status": "ok" }`), final-code run `6802e82a-66d8-4ef1-8206-1da6eef56679` (plan `YESX56`) stored 94 verified quotes: 55 flight, 26 high-speed rail, and 13 normal train. All three participants and one complete candidate city were covered. Task outcomes were 20 succeeded, 9 empty, 7 terminal `PROVIDER_INVALID_RESPONSE`, and 48 not needed after complete coverage. The run entered `calculating`, recorded Calculation `model_failed` with `invalid_output`, persisted no proposal rows, and failed closed with `RUN_ADVANCE_FAILED`. No Supervisor approval or guarded publication occurred. Do not treat this run as a completed publication.
- Root cause of that `invalid_output`: DeepSeek intermittently returned non-JSON content even with `response_format=json_object` (reproduced redacted on the same 16-quote eligible-city input: 1 of 5 SDK calls failed `json_parse`; the rest were schema-valid). Calculation recorded `model_failed` and threw, which bypassed the two-attempt proposal loop and became `RUN_ADVANCE_FAILED`.
- Failing-first fixes: DeepSeek adapter retries once on `MODEL_INVALID_OUTPUT`; the orchestrator consumes retryable model/persist failures inside the two-attempt loop instead of fail-closing the advance lease; Supervisor `reviewProposal` retries transport errors and treats an already-applied approval as idempotent success; when the model selects the deterministic winning city, Calculation canonicalizes schemes/totals/comparison evidence from `rankEligibleCities` before validation (model input still has no preselected winner).
- Post-fix live attempts (gateway healthy): run `52f45eb0-41fd-4842-b673-6b0166eb6d99` (plan `081CFA`) reached Calculation with 110 quotes / one eligible city; attempt 1 was `POLICY_MISMATCH`, attempt 2 validated and Supervisor model completed, then review persistence failed closed as `RUN_ADVANCE_FAILED` before the review-retry fix. Run `712406d3-ef90-4cf8-b62f-d3d1bb9d3b70` (plan `TFCHT3`) reached Calculation with 78 quotes; both attempts were rejected for `TOTAL_FARE_MISMATCH`/`POLICY_MISMATCH` before scheme canonicalize landed (`AGENT_PROPOSAL_INVALID`). Run `e80716c9-ea53-4525-b50c-5651b9998e5a` (plan `UV4VQ5`) after canonicalize ended `incomplete` with `REAL_QUOTE_COVERAGE_INCOMPLETE` after repeated cooling_down (28 quotes; no eligible city; no Calculation events). Stopped further supplier-backed attempts to avoid additional rate-limit burn.
- After a later supplier probe returned real flight options (Beijing→Shanghai, 10 rows, HTTP 200, no rate-limit), the production Next.js bundle was rebuilt at `542713a` and one fresh three-person plan was executed. Plan `VXYI6G` / run `93e7ad8c-1e15-4a3b-905f-c5fb67b02c45` progressed `pending` → `collecting` → `calculating` → `validating` → `completed` with no diagnostic code. It stored 57 verified quotes (35 flight, 15 high-speed rail, 7 normal train) covering all three participants. The guarded publication wrote a shared result for city `hefei` with exactly two schemes (`saving`, `fast`) and six route rows (three per scheme). Every `recommendation_scheme_routes.verified_quote_id` references a `verified_quotes.id` from this same run. Public `GET /api/plans/VXYI6G` exposes `latestRun.status=completed` and `latestSharedResult` for that city. This clears the fresh post-fix publication blocker.

## Browser And Device Acceptance

### Automated browser evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| Mobile viewport around `390x844` | PARTIAL PASS | The create page and incomplete-result page rendered at exactly 390×844 with no horizontal overflow. |
| Native arrival-date control | PARTIAL PASS | A native `input[type=date]` exists, but the automated browser could not operate the OS-native picker; no selection interaction is claimed. |
| Participant-limit control | PASS | The custom panel exposed exactly 2–6 people and selected 2 people. |
| Create/share/join flow | PARTIAL PASS | A local plan was created and the join page rendered the expected name, city, and three transport-mode controls. The complete browser-driven join flow was not claimed. |
| Incomplete recovery | PASS | Fallback run `run_ad2db55d-f3a9-445d-b07b-d8f0224fe5b7` ended `incomplete` with `REAL_QUOTE_COVERAGE_INCOMPLETE`; the result page showed retry guidance and zero scheme headings/cards. |
| Completed one-city/two-scheme result | NOT RERUN | Automated browser was not rerun after publication; the physical-phone check passed. |
| Participant route details | NOT RERUN | Automated browser was not rerun after publication; the physical-phone check passed. |
| Private alternative preview | NOT RERUN | Automated browser was not rerun after publication; physical requester/privacy checks passed. |
| Host confirmation (first physical request) | PASS | The first host confirmation was completed from the physical host context and persisted run `ca1c2cec-38f9-4eff-8a31-f331fa838c3f` as completed/shared/published. Repeated idempotent confirmation is covered by API and rollback-safe RPC tests; no second physical UI request is claimed. |
| Desktop viewport around `1440x1000` | PASS | The result route used a 448px-wide H5 canvas at x=496, leaving equal 496px side margins with no horizontal overflow. |
| Browser console | PASS | No warning or error entries were observed during the checked routes. |

### Real-device evidence

Status: **PASS**.

- On a physical phone, the native arrival-date picker opened and submitted `2026-08-15`; the two-person plan created successfully with no horizontal overflow.
- The share link opened in a private browser context, both participants joined, and the ordinary tab updated to 2/2 without manual refresh.
- The first calculation exposed a real UI defect: the result component refreshed GET data but never called the authenticated advance endpoint, leaving the run at `pending`. `RefreshingResultNotice` now loads the participant token from browser-local meeting history and posts one bounded advance before refreshing. Focused result/alternative tests pass 13/13.
- After hot reload and direct result-page navigation, the phone emitted authenticated advance requests and the run progressed from `pending` to `completed`. The result displayed one city, exactly saving/fast cards, two participant routes per scheme, route details/freshness, no legacy metrics or booking links, and no horizontal overflow.
- A private alternative preview was visible to the requester and hidden from the second participant in the private tab. It reached `awaiting_host_confirmation` with two persisted schemes and four routes, all referencing same-run verified quotes.
- A subsequent first confirmation from the physical host context succeeded. Authoritative persisted verification shows alternative run `ca1c2cec-38f9-4eff-8a31-f331fa838c3f` is now `completed`, owns the current shared result, and is published.
- No second physical UI confirmation request was made. Idempotent repeated confirmation remains covered by the confirmation API tests and rollback-safe RPC smoke, which also cover invalid-host rejection and exact-proposal replacement.

## Final Review

Status: **PASS**.

- No Critical finding was reported.
- Three Important findings were independently verified and fixed with failing-first regressions. Calculation no longer receives a preselected deterministic winner; it proposes from verified candidate facts while deterministic policy replay validates afterward. This also removes the pre-model policy-limit throw and contradictory `coverageComplete`/`deterministicPolicyResult` state.
- Regressions verify that no recommendation is preselected in model input, policy-limit rejection preserves `POLICY_INPUT_LIMIT_EXCEEDED`, and malformed candidate snapshots remain untrusted model input that deterministic validation rejects.
- The prior successful publication and confirmed alternative were generated while the temporary preselected-winner wiring was present. Final review therefore required one fresh supplier-backed run through Calculation, Supervisor, and guarded publication with the corrected code; that run is now recorded above as plan `VXYI6G` / run `93e7ad8c-1e15-4a3b-905f-c5fb67b02c45` on commit `542713a`.

## Release Blockers

1. ~~After supplier recovery, run one fresh supplier-backed plan through Calculation, Supervisor, and guarded publication on the post-fix code; verify both schemes and all six selected quote references belong to that same run's `verified_quotes`.~~ **Cleared** by plan `VXYI6G` / run `93e7ad8c-1e15-4a3b-905f-c5fb67b02c45` on `542713a`.
2. ~~Rotate the Supabase secret key and database password that were exposed in the operator conversation and update local server-only configuration.~~ **Waived by operator on `2026-07-17`** — credentials were not rotated; existing local server-only configuration retained. Residual exposure risk is accepted by the operator and is not recorded as completed rotation.

Task 14 is complete under the operator waiver above. Multi-Agent may be described as released with that residual credential risk acknowledged.

## Non-blocking Residual Hygiene

These items are outside the Task 14 release gate. They do not reopen Multi-Agent acceptance.

1. **Gateway Docker image smoke** — Dockerfile exists under `services/travel-provider-gateway/`, but historical ledger entries record Docker daemon unavailable on 2026-07-12/13, so image build and in-container `GET /healthz` plus authenticated `POST /v1/search` rejection/routing were never verified on this host.
2. **Automated browser PARTIAL criteria** — physical-phone acceptance already passed; automated browser still has PARTIAL for native date-picker interaction, complete join flow, and post-publication result-card rerun (see Browser And Device Acceptance above).
3. **Optional Supabase credential rotation** — waived on 2026-07-17; may be done later as hygiene without changing the Task 14 verdict.
