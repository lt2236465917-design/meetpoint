# Multi-Agent Live Acceptance — 2026-07-15 Gate

This record covers the Task 14 release gate. It contains no secrets, authorization headers, participant identities, raw provider output, fares, service numbers, or booking URLs.

## Verdict

**Blocked — do not describe the Multi-Agent architecture as released.** Real Supabase migration and guarded RPC smoke now pass. Two fresh persisted supplier runs produced complete real-quote coverage for one candidate city, but neither completed Calculation/Supervisor/publication; real-device acceptance also remains unavailable.

## Evidence Metadata

- Recorded at: `2026-07-16 09:45 CST`
- Evidence base commit: `473896c` (the migration-chain and DeepSeek protocol fixes were verified in the working tree before their handoff commit)
- Desktop host: macOS local development environment
- Automated browser: Codex in-app browser; Chromium version was not exposed
- Real phone/device: unavailable

## Automated Quality Gates

| Check | Result | Evidence |
| --- | --- | --- |
| Root lint | PASS | `npm run lint`, exit code 0 |
| Root tests | PASS | 57 files, 320 tests |
| Root production build | PASS | The sandboxed attempt was blocked by Turbopack local-port permission; the identical command passed outside the sandbox, including TypeScript and static-page generation. The route manifest contains no legacy explain endpoint. |
| Gateway lint | PASS | `npm run lint`, exit code 0 |
| Gateway tests | PASS | 7 files, 90 tests |
| Gateway build | PASS | `npm run build`, exit code 0 |
| Legacy static guard | PASS | `tests/no-legacy-recommendation-path.test.ts` scans production file paths and contents; no estimate, weighted three-city, target-time, partial-estimate, or explain-only path remains. |

## PostgreSQL And Supabase Migration Smoke

Status: **PASS**.

- An operator-approved Supabase project was configured locally without committing credentials. The empty test schema was explicitly reset, then all six repository migrations were executed in one SQL transaction through the Supabase SQL Editor.
- The first live attempt exposed a fresh-install chain defect: the repository lacked its historical baseline migration and retained the legacy non-null host-token column. The chain now starts with `202607080001_initial_schema.sql`; the Multi-Agent migration copies legacy host hashes into `plan_credentials` before dropping the old column.
- The corrected migration transaction completed successfully. A rollback-safe service-role RPC smoke returned `RPC_SMOKE_PASS`: public roles were rejected, automatic publication passed, an invalid host was rejected, valid host confirmation passed, and smoke data was rolled back.
- A final read-only parity query passed all nine checks: required tables, removed legacy columns, both guarded RPCs, four Realtime publication tables, and RLS on all nine Multi-Agent tables.

## Fixed Supplier Coverage Plan

Status: **BLOCKED AT CALCULATION/PUBLICATION**.

- No direct gateway probe was counted. Both runs used new three-participant plans persisted in Supabase, with flight, high-speed rail, and normal-train participants. Each matrix contained 84 route tasks: 24 flight, 24 high-speed rail, 36 normal train, including 48 previous-day tasks.
- Run `a2197d4e-b3bb-457c-80d1-4839a73c8919` stored 85 verified quotes (26 flight, 44 high-speed rail, 15 normal train), including 20 previous-day and 20 overnight-arrival quotes. All three participants and one complete candidate city were covered. Task outcomes were 18 succeeded, 12 empty, 10 terminal `PROVIDER_INVALID_RESPONSE`, and 44 not needed after complete coverage; no cooldown timestamps occurred. Calculation then failed because the DeepSeek JSON-output request omitted the required JSON instruction.
- The adapter now supplies an explicit JSON instruction and format examples, sets a 4096-token response budget, and disables DeepSeek V4 thinking through the top-level OpenAI-format `thinking` field. A redacted diagnostic against the persisted quote shape returned `finish_reason=stop`, parseable JSON, and a schema-valid five-field Calculation result.
- Run `e1c5009b-d4f3-4151-a674-b181a0d6e7f5` stored 50 verified quotes (25 flight, 11 high-speed rail, 14 normal train), including 14 previous-day and 14 overnight-arrival quotes. All three participants and one complete candidate city were covered. Task outcomes were 12 succeeded, 11 empty, 9 terminal `PROVIDER_INVALID_RESPONSE`, and 52 not needed after complete coverage; no cooldown timestamps occurred.
- The second run reached Calculation and completed its first model request, but the model returned an `incomplete` proposal despite controlled complete coverage. Deterministic validation rejected it with `INVALID_PROPOSAL`; the correction attempt produced invalid output and the run failed closed with `RUN_ADVANCE_FAILED`.
- Neither run created a recommendation result or scheme route. Therefore no claim is made that both saving/fast schemes trace every participant route to stored `verified_quotes`; this remains the supplier/publication gate blocker.

## Browser And Device Acceptance

### Automated browser evidence

| Criterion | Result | Evidence |
| --- | --- | --- |
| Mobile viewport around `390x844` | PARTIAL PASS | The create page and incomplete-result page rendered at exactly 390×844 with no horizontal overflow. |
| Native arrival-date control | PARTIAL PASS | A native `input[type=date]` exists, but the automated browser could not operate the OS-native picker; no selection interaction is claimed. |
| Participant-limit control | PASS | The custom panel exposed exactly 2–6 people and selected 2 people. |
| Create/share/join flow | PARTIAL PASS | A local plan was created and the join page rendered the expected name, city, and three transport-mode controls. The complete browser-driven join flow was not claimed. |
| Incomplete recovery | PASS | Fallback run `run_ad2db55d-f3a9-445d-b07b-d8f0224fe5b7` ended `incomplete` with `REAL_QUOTE_COVERAGE_INCOMPLETE`; the result page showed retry guidance and zero scheme headings/cards. |
| Completed one-city/two-scheme result | BLOCKED | Requires a fully covered persisted supplier run. |
| Participant route details | BLOCKED | Requires a fully covered persisted supplier run. |
| Private alternative preview | BLOCKED | Requires an existing completed shared result. |
| Host confirmation and idempotency | BLOCKED | Requires an existing completed shared result and a browser holding the one-time host token. |
| Desktop viewport around `1440x1000` | PASS | The result route used a 448px-wide H5 canvas at x=496, leaving equal 496px side margins with no horizontal overflow. |
| Browser console | PASS | No warning or error entries were observed during the checked routes. |

### Real-device evidence

Status: **BLOCKED**. No physical phone was available. Native picker behavior, touch interaction, share/open/join across devices, live progress, completed result, private preview, and host confirmation were not verified on a real device.

## Release Blockers

1. Make controlled complete coverage explicit to Calculation, retain fail-closed validation, then run a third fresh persistent plan through Supervisor and guarded publication. Verify exactly two schemes and six selected participant routes, all referencing stored verified quotes.
2. Run the full H5 flow on a physical phone and repeat the layout check at approximately 390×844 and 1440×1000, including native date selection, completed one-city/two-scheme details, incomplete recovery, private preview privacy, and host-only idempotent confirmation.
3. Rotate the Supabase secret key and database password that were exposed in the operator conversation, update local server-only configuration, and rerun the final root and gateway quality gates.

Task 14 remains incomplete until all three blockers are cleared.
