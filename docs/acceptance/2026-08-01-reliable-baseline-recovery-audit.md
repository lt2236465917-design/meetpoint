# Reliable Baseline Recovery Audit

Date: 2026-08-01

> Historical recovery record. On 2026-08-08 the source `/8fdd` dirty state was preserved as named stash commit `85830cef9204c2e418958b5a3ced29157bdffe66`, then the audited source and target auxiliary worktrees were removed. The production result remains commit `9b965a7`; current cleanup state is recorded in `.superpowers/sdd/progress.md`.

## Scope and method

- Common ancestor: `b38e60c`.
- Preserved target baseline: `a27476e` (includes Alibaba mainland packaging, background recommendation worker, leave-and-finish acceptance, and Node 20 runtime alignment).
- Authoritative reliable-baseline/FlyAI patch source: `/Users/lixinyu/.codex/worktrees/8fdd/cross-city-meetpoint` working tree.
- Merge target: `/Users/lixinyu/.codex/worktrees/106f/cross-city-meetpoint` working tree.
- The source worktree was read only. It was not edited, stashed, committed, reset, or cleaned.
- Every tracked source path was audited as a three-way merge of `a27476e` + source working file with base `b38e60c`. Twenty-eight paths match the clean three-way result byte-for-byte. Five textual conflicts were resolved explicitly as recorded below.
- Every source-untracked implementation/test file is byte-for-byte identical in the target. The authoritative spec and plan preserve the source content and are intentionally extended by the separately authorized DeepSeek transport design/plan.
- No remote migration, deployment, credentialed provider probe, or production plan write is authorized until the recovery gates below pass.

## Per-path recovery checklist

| Source path | Clean-base change | Source patch intent | Target merge result | Conflict | Verification |
| --- | --- | --- | --- | --- | --- |
| `.superpowers/sdd/progress.md` | `a27476e` adds mainland worker/Node 20 evidence | Record reliable baseline/FlyAI implementation and operator next steps | Both ledgers retained | Manual | Semantic markers + full gates |
| `AGENTS.md` | `a27476e` adds Node 20 service-role transport rule | Make deterministic baseline mandatory without weakening live-fare guards | Exact clean three-way merge | No | Byte comparison + policy tests |
| `docs/architecture.md` | Adds mainland topology and run-worker rows | Document baseline policy, FlyAI circuit/probe, and baseline module | Worker rows retained; baseline row combined | Manual | Semantic markers + doc review |
| `docs/integration-guide.md` | Adds worker/deployment operator guidance | Add baseline fields, probe command, and migration guidance | Exact clean three-way merge | No | Byte comparison + build |
| `docs/superpowers/README.md` | Adds mainland/run-worker authority chain | Promote 2026-08-01 spec/plan | Baseline authority inserted while full newer chain remains | Manual | Ordered-list review |
| `services/travel-provider-gateway/package.json` | None | Add `probe:contract` command | Exact clean three-way merge | No | Gateway lint/test/build/probe structure |
| `services/travel-provider-gateway/src/flyai-adapter.ts` | None | Accept exact Chinese enums and preserve strict normalization | Exact clean three-way merge | No | FlyAI regression tests |
| `services/travel-provider-gateway/src/service.ts` | None | Add repeated-schema-drift circuit | Exact clean three-way merge | No | Gateway service tests |
| `services/travel-provider-gateway/tests/flyai-adapter.test.ts` | None | Regress real `飞机` / `火车` contract | Exact clean three-way merge | No | Gateway suite |
| `services/travel-provider-gateway/tests/service.test.ts` | None | Verify schema-drift circuit/reset/redaction | Exact clean three-way merge | No | Gateway suite |
| `src/app/api/plans/[code]/participants/route.ts` | None | Persist server-canonical departure coordinates | Exact clean three-way merge | No | Participant route tests |
| `src/app/api/plans/[code]/route.ts` | Adds run-worker public progress behavior | Project safe baseline fields | Exact clean three-way merge | No | Plan read + public-boundary tests |
| `src/app/p/[code]/result/page.tsx` | None | Render baseline before live progress | Exact clean three-way merge | No | Result page tests/build |
| `src/components/result/RefreshingResultNotice.tsx` | Adds leave-friendly worker and stale-expiry copy | Keep baseline visible for incomplete/failed live collection | Stale-expiry guidance and baseline-safe generic copy both retained | Manual | Result page tests |
| `src/lib/agent/manager-agent.ts` | None | Generate/persist baseline from canonical inputs | Exact clean three-way merge | No | Manager tests |
| `src/lib/agent/run-orchestrator.ts` | Adds worker listing/advance semantics | Replace hard-coded secondary flag with capability seam | Exact clean three-way merge | No | Orchestrator + worker tests |
| `src/lib/city/amap-client.ts` | None | Return canonical Amap coordinates | Exact clean three-way merge | No | Departure/candidate tests |
| `src/lib/city/candidate-generator.ts` | None | Include canonical Amap origins in midpoint ranking | Exact clean three-way merge | No | Candidate tests |
| `src/lib/city/departure-city.ts` | None | Require and return server-canonical coordinates | Exact clean three-way merge | No | Departure tests |
| `src/lib/fallback/mvp-store.ts` | None | Mirror baseline persistence and public projection locally | Exact clean three-way merge | No | Root suite |
| `src/lib/recommendation/query-matrix.ts` | None | Candidate-first participant-interleaved tasks | Exact clean three-way merge | No | Query matrix tests |
| `src/lib/recommendation/repository.ts` | Adds worker list/order behavior | Persist/read baseline and query priorities | Exact clean three-way merge | No | Repository + worker + PostgreSQL tests |
| `supabase/schema.sql` | Adds worker listing/stale-window database contract | Add canonical coordinates, baseline fields/constraints, priorities and guarded RPCs | Exact clean three-way merge | No | Schema tests + PostgreSQL suite |
| `tests/candidate-generator.test.ts` | None | Cover Amap midpoint and fail-closed coordinates | Exact clean three-way merge | No | Root suite |
| `tests/departure-city.test.ts` | None | Cover canonical coordinate resolution | Exact clean three-way merge | No | Root suite |
| `tests/manager-agent.test.ts` | None | Cover baseline generation/persistence | Exact clean three-way merge | No | Root suite |
| `tests/participant-route.test.ts` | None | Cover persisted canonical coordinates | Exact clean three-way merge | No | Root suite |
| `tests/plan-read-route.test.ts` | Adds worker progress projection fixtures | Cover safe public baseline projection | Exact clean three-way merge | No | Root suite |
| `tests/query-matrix.test.ts` | None | Cover candidate-first interleaving | Exact clean three-way merge | No | Root suite |
| `tests/recommendation-repository.test.ts` | Adds worker repository behavior | Cover baseline/priority RPCs and ordering | Exact clean three-way merge | No | Root suite |
| `tests/result-page.test.ts` | Adds leave-friendly/stale UI cases | Cover baseline retention and no fare claims | Exact clean three-way merge | No | Root suite |
| `tests/run-orchestrator.test.ts` | Uses far-future fixture and worker mocks | Cover injected secondary capability | Kept `2999` non-stale fixture plus secondary-capability cases | Manual | Orchestrator + worker tests |
| `tests/supabase-public-read-boundary.test.ts` | None | Cover new baseline columns/RPC denial | Exact clean three-way merge | No | Root + PostgreSQL tests |
| `docs/acceptance/2026-08-01-reliable-baseline-local-acceptance.md` | Absent | Record source local acceptance | Byte-for-byte source copy | No | `cmp` |
| `docs/superpowers/plans/2026-08-01-reliable-baseline-and-live-fare-enhancement.md` | Absent | Reliable baseline implementation plan | Source plan retained; DeepSeek phase appended separately | Intentional extension | Source diff review |
| `docs/superpowers/specs/2026-08-01-reliable-baseline-and-live-fare-enhancement-design.md` | Absent | Authoritative product/technical contract | Source spec retained; DeepSeek transport supplement appended separately | Intentional extension | Source diff review |
| `services/travel-provider-gateway/scripts/probe-live-contract.mjs` | Absent | Redacted credentialed probe entry | Byte-for-byte source copy | No | `cmp` + gateway suite/build |
| `services/travel-provider-gateway/src/contract-probe.ts` | Absent | Traverse production normalizer with redacted summary | Byte-for-byte source copy | No | `cmp` + probe tests |
| `services/travel-provider-gateway/tests/live-contract-probe.test.ts` | Absent | Verify probe redaction and mode coverage | Byte-for-byte source copy | No | `cmp` + gateway suite |
| `src/components/result/BaselineRecommendation.tsx` | Absent | Safe baseline-only UI | Byte-for-byte source copy | No | `cmp` + result tests/build |
| `src/lib/recommendation/baseline.ts` | Absent | Deterministic baseline policy/fingerprint | Byte-for-byte source copy | No | `cmp` + baseline tests |
| `supabase/migrations/202608010001_reliable_baseline_recommendation.sql` | Absent | Add protected baseline/coordinate/priority persistence | Byte-for-byte source copy | No | `cmp` + PostgreSQL suite |
| `tests/baseline-recommendation-schema.test.ts` | Absent | Guard schema/migration/public boundary | Byte-for-byte source copy | No | `cmp` + root suite |
| `tests/postgres/baseline-persistence.test.ts` | Absent | Verify migration, idempotency, mutation rejection and roles | Byte-for-byte source copy | No | `cmp` + PostgreSQL suite |

## Temporary-file and source-worktree checks

- No `.codex-merge-base-*.tmp`, `.codex-conf-base-*.tmp`, `.codex-audit-*.tmp`, or equivalent merge scratch files remain in the target.
- Source status still contains the same 44 modified/untracked paths (33 tracked modifications and 11 untracked paths).
- `git diff --check` passed after recovery.

## Recovery gate status

Passed locally with fresh evidence:

- Gateway lint passed.
- Gateway tests passed: 8 files / 133 tests.
- Gateway TypeScript build passed.
- Root lint passed.
- Root tests passed: 78 files / 513 tests. Relative to the source acceptance's 75 files / 483 tests, the additional coverage comes from the preserved `a27476e` worker/mainland-runtime tests plus five DeepSeek transport contract tests already present in the separate work layer; no source test was removed.
- Root production build and TypeScript passed after the expected managed-sandbox local-port denial was rerun with local-process permission.
- Disposable PostgreSQL 17.10 passed: 6 files / 76 tests. The temporary local server was stopped after the run.
- `git diff --check` passed, and merge scratch-file scan remained empty.

This proves the recovered local baseline and preserved newer runtime coexist. It is not remote migration, supplier, deployment, or production acceptance.
