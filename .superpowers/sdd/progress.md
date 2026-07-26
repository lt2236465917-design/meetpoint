# Create Plan Input Controls SDD Progress

Base: `eb22e785`
Branch: `task-1-scaffold`

- Task 1: complete (commit `c57d26a`, review clean)
- Task 2: complete (commits `51283d5`, `7d20be9`, review clean after duplicate-picker fix)
- Task 3: conditionally complete (focused tests and quality gates verified; browser mobile acceptance blocked by local connectivity; elevated gateway health check later returned HTTP 200; real-price recalculation still needs a plan code and participant set)

# DeepSeek Integration SDD Progress

Base: `6e9e691`
Branch: `task-1-scaffold`

- Task 1: complete (commits `6e9e691..ab2baa1`, review clean)
- Task 2: complete (commit `51743de`, review clean)
- Task 3: complete (commit `14cd10a`, review clean; live provider smoke schema-valid)
- Final review: complete (commit `eac514c`; re-review ready to merge)

# Amap And FlyAI Integration SDD Progress

Base: `9df9e7a`
Branch: `task-1-scaffold`

- Task 1: complete (commit `39e2666`, review clean; Minor: probe safety boundaries have limited automated regression coverage)
- Task 2: complete (commit `0de6fb2`, review clean)
- Task 3: complete (commits `3d779f1`, `b2de12f`; review clean after fixture-contract fix)
- Rules correction: complete (commit `5110088`; gateway path aligned to `services/travel-provider-gateway/`)
- Task 4: complete (commits `627c90e`, `e88043f`; review clean after build-output fix)
- Task 5: complete (commits `670c669`, `e232cae`; review clean after route-consistency and error-redaction fixes; real provider schema unverified)
- Task 6: complete (commits `3f0fd53`, `47b7d7b`; review clean after cached-response isolation fix)
- Task 7: complete (commit `8972cff`; local policy/test/build verified; Docker daemon unavailable, so image build remains unverified)
- Task 8 precondition: complete (commit `08f3c79`; gateway PORT default aligned to 8080, review clean)
- Task 8: complete (commits `0c3d576..73b3a71`; review clean after deterministic ordering and mode-deduplication fixes)
- Task 9: complete (commit `630930f` plus follow-up fix; review clean after collector-entry timeout fix)
- Task 10: complete (source/freshness/safe booking UX; review clean after estimated-link gate fix)
- Task 11: complete (stable docs reconciled through Task 10; historical plan docs left unchanged)
- Task 12: partially complete (commits `c315b06`, `eaada78`, `a9097b8`, `a90ccf8`, `c20122f`; credentialed redacted probe confirmed Amap and FlyAI train field summaries; direct gateway smoke confirmed real FlyAI flight/train rows, `data.itemList` normalization, numeric string price handling, China-time timestamp normalization, query freshness, and `a.feizhu.com` booking hosts; root and gateway lint/test/build passed after `a9097b8` and again after gateway error classification; Docker daemon unavailable on 2026-07-13, so image build and image-internal smoke remain blocked; main-app travel search now batches provider work at four concurrent requests and result-page smoke confirmed `飞猪参考价` plus `去飞猪查看`, but full real-result acceptance still stores `PARTIAL_ESTIMATE_FALLBACK` because direct gateway diagnostics returned provider failures for some route/mode pairs; DeepSeek credentialed explain returned `{ ok: true, count: 12 }` and did not change the latest run id/status/error summary; root `.env.local` now sets `TRAVEL_GATEWAY_URL=http://127.0.0.1:8080` and a `TRAVEL_GATEWAY_TOKEN` matching the gateway `.env`; FlyAI CLI failures are now classified into no-route, no-ticket, rate-limit, upstream-unavailable, CLI-failed, timeout, unavailable, and invalid-response gateway errors without returning raw provider output; 2026-07-13 fixed FlyAI adapter probe saved to `services/travel-provider-gateway/probe-output/flyai-adapter-2026-07-13.json` with 18 total route/mode checks, 16 successful with rows, 2 successful empty normal-train results, and 0 classified errors; later 2026-07-13 H5 smoke created plan `AZQN2Q` through the mobile UI and API repeat plan `Q6074Q`, both still produced partial estimates; redacted direct CLI showed FlyAI/Fliggy `MCP HTTP 403` risk-control rejection, now classified as `PROVIDER_RATE_LIMITED`; top-three-candidate diagnostics for `Q6074Q` grouped 18 route/mode checks into 10 successful row sets, one successful empty result, and seven `PROVIDER_RATE_LIMITED` responses, especially Guangzhou-origin requests)

# Multi-Agent Unique-City Recommendation SDD Progress

Base: `faf0ee1`
Branch: `task-1-scaffold`
Plan: `docs/superpowers/plans/2026-07-15-multi-agent-recommendation-implementation.md`

> Entries before Task 14 are point-in-time completion records; their test counts and smoke notes are historical unless repeated in the Task 14 block.

- Preflight: root baseline 149/149 and gateway baseline 85/85 passing; executing in current dedicated branch by user decision.
- Approved resolution: automatic runs cannot replace an existing shared result; only host-confirmed alternative runs may replace it.
- Approved resolution: `quoteId` is the gateway-issued stable evidence ID; nullable upstream-native ID is preserved separately as `providerQuoteId`.
- Task 1: complete (commits `4c5a24a`, `f3a147e`; review clean after migration-order, accepted-mode, and canonical-index fixes; PostgreSQL runtime smoke deferred to Task 14).
- Task 2: complete (commits `2fe2df3`, `5c063e0`, `a832325`; review clean after arrival-date runtime, atomic credential RPC, public projection, overnight feasibility, and obsolete-copy fixes; root 164/164, lint/build verified by implementer).
- Task 3: complete (commit `37da430`; spec compliant and quality approved; gateway 90/90, root 164/164, lint/build verified by implementer; Minor for final review: main-app gateway error schema does not independently enforce non-null `retryAfterMs` only for `PROVIDER_RATE_LIMITED`).
- Task 4: complete (commit `3e48ffb`; spec compliant and quality approved; focused 12/12, schema 9/9, root 164/164, lint/build verified by implementer; participant-level route-task unique key corrected before first real migration smoke; Minors for final review: explicit tests do not cover empty `options`, every invalid-response terminal code, or every retryable gateway code).
- Task 4 controller resolution: editing `202607150001_multi_agent_recommendation.sql` in place is safe because the real PostgreSQL/Supabase migration smoke has not run; first runtime validation remains Task 14. Do not describe it as deployed.
- Task 5: complete (commits `4395430`, `cf2aab4`, `fecc0e3`; spec compliant and quality approved after two security fix waves; focused 52/52, root 216/216, lint/build verified by implementer; prompts validate the final serialized payload, model outputs fail closed on open schemas, and trace values use structural constraints/trusted model registry).
- Task 5 operational note: trace model registry currently allows only `deepseek-v4-flash`; future model additions require explicit reviewed registry updates.
- Task 6: complete (commits `c1cf5bd`, `8672b4c`, `4c84ff5`, `0fed62a`; spec compliant and quality approved after arrival-date evidence, terminal CLI error, persisted date mapping, atomic matrix/outcome RPC, bounded recovery, and concurrency hardening fixes; focused 48/48, root 245/245, lint/build verified; real PostgreSQL/Supabase execution of the new RPCs remains deferred to Task 14 and is not claimed by static/mock tests).
- Task 7: complete (implementation `e14ccc1`, hardening `4f69bd4`); independent specification review passed. Independent code-quality review found unbounded DP state and transition work; the follow-up adds deterministic 50,000-state and 200,000-transition budgets that reject with `POLICY_INPUT_LIMIT_EXCEEDED` rather than truncating. Second independent review found no Critical/Important findings. Focused 32/32, root 272/272, lint, and production build passed. The legacy `scoring.ts` production module remained intentionally unchanged until its callers migrated in Tasks 9–10 and the path was removed in Task 13; the specification reviewer accepted this sequencing.
- Task 8: complete (commits `b9a0a3e`, `4cf7154`; independent specification and quality reviews clean after five Important fixes). Complete coverage now rejects a fabricated model `incomplete` through the persisted two-attempt review loop; Chinese explanations use fixed fact-free safe copy; correction codes are allowlisted; proposal review persistence uses a pending-state CAS; and Calculation/Supervisor persist allowlisted trace events. Focused 69/69, root 317/317, lint, and production build passed.
- Task 9: complete (implementation `2fa2611` plus orchestration hardening); independent specification and code-quality reviews passed after fixing advance-request ownership, PostgreSQL publication-RPC UUID handling, uncaught advance failure termination, per-candidate real-coverage eligibility, and capped targeted recovery. Focused 23/23, root 322/322, lint, and production build passed. The lease-column migration has not run against PostgreSQL/Supabase and remains a Task 14 live-smoke check. The fallback store remains intentionally legacy until Task 10.
- Task 10: complete (implementation commit `33083af`, review hardening `dc87878`); estimates and legacy three-city publication are removed from fallback. Pending work now advances only on injected verified quotes, missing coverage ends `incomplete`, publication materializes one city/two schemes only after deterministic policy validation, and alternatives remain private until host confirmation. The fallback advance response includes `runId`, matching the durable API contract. Independent specification and code-quality review passed after preserving the existing shared result while a private preview is pending, requiring an existing shared result before alternative confirmation, revalidating at materialization, binding selected quotes by participant plus quote ID, converting alternative materialization failures into terminal guarded failures, and persisting allowlisted local trace events. Focused 6/6, root 325/325, lint, and production build passed.
- Task 11: complete (commit `5e7367f`); shared result rendering now consumes the persisted shared result, schemes, and selected quote routes directly, shows one city with exactly saving/fast schemes, exposes bounded run-state feedback, and removes the legacy three-city recommendation card. Focused UI tests passed 20/20; root 331/331, lint, and production build passed. The first sandboxed build attempt was blocked by Turbopack local-port permissions; the same production build passed outside the sandbox. Task 14 PostgreSQL/Supabase migration smoke remains required.
- Task 12: complete (commit `0fd3964`); any participant can create a canonical one-city alternative run, only the requester or host can read its private progress/result, the public route remains anchored to the prior shared result, and only `x-host-token` can atomically confirm the exact approved proposal. Repeated confirmation is idempotent. Focused 49/49, root 345/345, lint, and production build passed; the first sandboxed build attempt was blocked by Turbopack local-port permissions and the same production build passed outside the sandbox. PostgreSQL/Supabase runtime smoke and real-device acceptance remain Task 14 work.
- Task 13: complete (commit `b9ce7ee`); a static production-path/content guard was observed failing on the remaining estimate and weighted three-city references before implementation, then passed after removing the estimate/unavailable/FlyAI legacy shells, three-city scoring, explanation-only route/module, obsolete domain types, fallback explain entry, and legacy tests. Focused 17/17, root 318/318, lint, and production build passed; the first sandboxed build attempt was blocked by Turbopack local-port permissions and the identical build passed outside the sandbox.
- Task 14: complete. Real Supabase migration, RLS, Realtime, guarded publication/confirmation RPC smoke, public-role rejection, rollback, schema parity, supplier coverage, physical-phone date/create/share/join/progress/result/private-preview checks, and post-fix guarded publication on plan `VXYI6G` / run `93e7ad8c-1e15-4a3b-905f-c5fb67b02c45` (`542713a`) all pass. The phone run exposed and has a TDD regression for a missing automatic advance POST: `RefreshingResultNotice` loads the local participant token, posts one bounded advance, then refreshes. The first physical-host confirmation succeeded for alternative run `ca1c2cec-38f9-4eff-8a31-f331fa838c3f`. On `2026-07-17` the operator explicitly waived Dashboard rotation of the exposed Supabase secret key and database password and retained the existing local `.env.local` credentials; residual risk is accepted and is not claimed as completed rotation. Canonical evidence: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md`.
- Final gates pass: root lint, 57-file/331-test suite, and production build; gateway lint, 7-file/90-test suite, and build.
- Final review has no unresolved Critical or Important finding. Three valid Important findings were fixed with failing-first regressions by removing the preselected deterministic winner from model input and retaining deterministic policy as post-proposal validation; policy-limit diagnostics and malformed snapshot handling are covered.
- Next (non-blocking residual hygiene; does not reopen Task 14): (1) with Docker daemon available, build `services/travel-provider-gateway` image and smoke container `/healthz` plus unauthenticated reject / authenticated search routing; (2) optionally close automated-browser PARTIAL criteria (native date picker interaction, full join flow, post-publication result cards) or leave phone evidence as authority; (3) optionally rotate waived Supabase credentials. Details: `docs/acceptance/2026-07-15-multi-agent-live-acceptance.md` § Non-blocking Residual Hygiene.

# UI Copy And Visual Direction Progress

Branch: `task-1-scaffold`

- Phase 1–4 + adaptive shell: **shipped and committed** (`a2d6908`, 2026-07-18).
- Inner atmosphere + meetup copy (Tasks 1–7): **shipped and committed** through `4972560` (2026-07-18). Spec/plan marked shipped in authority docs.
- Post-ship smoke recovery (2026-07-19): complete locally. Home retains four-clip continuous cycling with eager loading only for the active clip. Functional routes use one root-mounted fixed loop (create/join/alternatives=静水, plan/manage=密林, result/records=破晓), a moderate readable scrim, `pointer-events: none`, and per-scene playback checkpoints; records navigation gives immediate loading feedback and single-click activation. Alternatives/manage IA remains unchanged beyond the shared backdrop.
- Departure-city hardening (2026-07-19): complete locally. Canonical Amap administrative-district lookup, one bounded retry, and the server-memory China administrative-tree index cover prefecture and province-administered cities. Amap origin names persist into Manager/Query gateway requests; meeting candidates remain built-in hubs.
- Recommendation policy `2026-07-19.v2`: complete in code and tests. Saving selects the exact lowest verified direct-first fare across accepted modes, including direct normal train; fast stays within 130% of the saving total. Remote Supabase migration `202607190001_recommendation_policy_v2.sql` has **not been verified as applied**: CLI database authentication failed on 2026-07-19, so local files cannot establish the remote state. Verify the remote migration list and default before any new durable-run acceptance; if it is absent, rotate the exposed database password before dry-run and push.
- Final local gates (2026-07-19): post-neat root lint passed; 69 test files / 386 tests passed; production build passed outside the restricted sandbox after the expected Turbopack local-port denial; `git diff --check` passed. Staged-secret review remains required immediately before commit.
- Recovery Next: verify the remote v2 Supabase migration state. If it is absent, rotate the exposed database password, apply the migration, and verify the remote default. Merge/PR or push only by explicit user direction.

# Inner Atmosphere + Meetup Copy SDD Progress

Base: `a2d6908` (Phase 1–4 + adaptive shell)
Branch: `task-1-scaffold`
Plan: `docs/superpowers/plans/2026-07-18-inner-atmosphere-meetup-copy.md`
Shipped HEAD (Tasks 1–7 + final copy fix): `4972560`

- Task 1: complete (`a2d6908..4e573a4`)
- Task 2: complete (`4e573a4..2d82a2c`)
- Task 3: complete (`2d82a2c..f17fe0d`)
- Task 4: complete (`f17fe0d..7e1681e`); final review also cleared residual「再算一次」in `RefreshingResultNotice` (`4972560`)
- Task 5: complete (`7e1681e..d1fdba6`)
- Task 6: complete (`d1fdba6..35bae2e`)
- Task 7: complete (`35bae2e..a49b554` incl. CityCombobox lint fix + authority docs)
- Final review: post-ship recovery is locally complete; remote v2 migration verification remains an operational follow-up (see UI Progress Recovery Next).

# FlyAI Quote Normalization And Six-Person Publication Regression

Date: 2026-07-20

- Adapter hardening: complete in code and regression tests. Live FlyAI prices now normalize `ticketPrice`, `price`, and documented `adultPrice`, including currency-prefixed values. The operator probe reports direct, connecting, and unclassified counts without forcing a journey-type filter; sort types `3` and `8` remain diagnostics only.
- Six-person ownership regression: complete in code and regression tests. Plan `3QTCG4` / run `b353d7d1-3ec7-465b-8c02-4c255193bf06` exposed `PUBLICATION_GUARD_REJECTED` because repeated physical quote IDs across same-origin participants were materialized through a global quote-ID map. Durable materialization now resolves selected evidence by `(participantId, quoteId)`.
- Live recheck: incomplete for supplier reasons. A fresh six-person plan `S00HIY` / run `af3cdd3c-6982-4abe-b10e-5e3f8d1f2f13` safely ended `incomplete` after repeated `PROVIDER_RATE_LIMITED`; it did not exercise completed publication after the fix.
- Final local gates: root lint, 69-file/389-test suite, and production build pass; gateway lint, 7-file/92-test suite, and build pass. The root build required an unrestricted rerun only because the managed sandbox forbids Turbopack's local port binding.
- Next: after supplier recovery, create a new six-person repeated-origin plan and confirm `completed`, exactly two schemes, and six participant-owned route rows in each scheme. Do not treat the current incomplete run as live publication acceptance.

# Repository Security And State-Machine Audit

Initial audit date: 2026-07-20
Initial reviewed HEAD: `7797e99`

- Evidence baseline: root lint, 69-file/389-test suite, and production build pass; gateway lint, 7-file/92-test suite, and build pass. Passing gates do not clear the findings below.
- Original Critical, locally resolved by Batch A: FlyAI connecting itineraries were normalized from only the first segment, so a multi-segment journey could publish the wrong destination and arrival time while still passing the gateway schema.
- Original Critical, locally resolved by Batch A: Supabase read policies allowed broad anonymous access. A redacted anon-key probe enumerated plan identifiers/codes/titles, participant names/departures/modes, and recommendation-run kind/requester/requested-city metadata, including data belonging to private alternative previews.
- Batch A — publication safety and state-machine recovery: locally complete. It covers multi-segment fact normalization, API-only public projection, shared-result creation guards, continued healthy route recovery, bounded stale-run recovery, and prevention of hidden automatic runs after a shared result exists.
- Batch B — publication integrity: make result/scheme/route materialization atomic and make the database publication guard replay direct-first eligibility, saving/fast selection, and winning-city ranking rather than trusting application-supplied totals.
- Batch C — input and terminal UX hardening: validate Amap adcode/name pairs and real calendar dates, compare arrival instants as timestamps, keep private preview terminal failures visible to the requester, prevent private runs from replacing public automatic progress, and replace collision-prone plan-code creation with retry-safe generation.
- Batch A design: approved and committed in `7021f0e` — `docs/superpowers/specs/2026-07-20-publication-safety-and-run-recovery-design.md`.
- Batch A implementation plan: reviewed and committed in `8d760ed` — `docs/superpowers/plans/2026-07-21-publication-safety-and-run-recovery.md`.
- Batch A local implementation (2026-07-26): complete through `8f9c668`. The implementation history spans `ae70e00..8f9c668`; Batch A commits are `ae70e00..94d6e90`, `f2380d6`, `46aaaf3..4c4b0d9`, and `a95abc1..8f9c668` (the interleaved Vercel deployment commits are unrelated and excluded). Both Critical findings are fixed locally: complete ordered FlyAI itinerary normalization now fails closed on invalid/mixed segment evidence, and the local hardening migration removes anonymous/authenticated business-table enumeration plus business-table Realtime publication. All six Batch A items are covered: full-itinerary evidence, API-only public projection, shared-result preconditions for alternatives, per-route recovery exhaustion, bounded 15-minute active/seven-day confirmation expiry, and prevention of automatic runs after publication with deterministic `created`/`resume_existing` parity in Supabase and fallback paths. A production-build type regression found during final verification was fixed failing-first in `8f9c668` by narrowing fallback resumed statuses to the unified active-run contract.
- Batch A verification (2026-07-26): root focused 15 files / 109 tests passed; gateway FlyAI focused 1 file / 65 tests passed. Final full gates passed: root lint, 71 files / 448 tests, and production build; gateway lint, 7 files / 126 tests, and build. The first root build attempt was blocked by the managed sandbox's Turbopack local-process/port restriction; an identical unrestricted build then exposed the fallback type gap, and the final post-fix unrestricted build passed.
- Batch A operational boundary (2026-07-26): local migration `supabase/migrations/202607210001_publication_safety_and_run_recovery.sql` was not queried or applied remotely. Live FlyAI/supplier acceptance was not run, so fixture/build success is not live publication evidence. Batch B publication-integrity scope and Batch C input/terminal-UX scope remain unchanged and unimplemented.
- Batch B design (2026-07-26): independently reverified against `SupabaseRecommendationRepository.materializeApprovedProposal`, `publish_shared_result`, and `confirm_alternative_result`. Direct result/scheme/route inserts are non-atomic, the result-only existence check can accept a partial draft, and the database guards validate evidence consistency without independently replaying direct-first, saving/fast, or automatic winning-city policy. Approved design: `docs/superpowers/specs/2026-07-26-atomic-materialization-and-database-policy-replay-design.md`. No Batch B implementation has begun; create and review the failing-first implementation plan before code changes.
- Batch B implementation plan (2026-07-26): reviewed at `docs/superpowers/plans/2026-07-26-atomic-materialization-and-database-policy-replay.md`. It requires a guarded disposable local PostgreSQL suite before implementation can pass; the current workstation has no `supabase`, `docker`, `psql`, or `pg_isready` executable. Status: approved for failing-first execution; no Batch B code or migration implementation has begun.
