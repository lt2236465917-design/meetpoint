# Multi-Agent Live Acceptance — 2026-07-15 Gate

This record covers the Task 14 release gate. It contains no secrets, authorization headers, participant identities, raw provider output, fares, service numbers, or booking URLs.

## Verdict

**Blocked — do not describe the Multi-Agent architecture as released.** Automated root and gateway quality gates pass. Real PostgreSQL/Supabase migration smoke, a fresh persisted supplier-coverage plan, and real-device acceptance could not run in the available environment.

## Evidence Metadata

- Recorded at: `2026-07-16 00:12:35 CST`
- Build commit: `b9ce7ee932e789c505e4c88ed049e19bae789b08`
- Desktop host: macOS local development environment
- Automated browser: Codex in-app browser; Chromium version was not exposed
- Real phone/device: unavailable

## Automated Quality Gates

| Check | Result | Evidence |
| --- | --- | --- |
| Root lint | PASS | `npm run lint`, exit code 0 |
| Root tests | PASS | 56 files, 318 tests |
| Root production build | PASS | The sandboxed attempt was blocked by Turbopack local-port permission; the identical command passed outside the sandbox, including TypeScript and static-page generation. The route manifest contains no legacy explain endpoint. |
| Gateway lint | PASS | `npm run lint`, exit code 0 |
| Gateway tests | PASS | 7 files, 90 tests |
| Gateway build | PASS | `npm run build`, exit code 0 |
| Legacy static guard | PASS | `tests/no-legacy-recommendation-path.test.ts` scans production file paths and contents; no estimate, weighted three-city, target-time, partial-estimate, or explain-only path remains. |

## PostgreSQL And Supabase Migration Smoke

Status: **BLOCKED**.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are not configured in the root local environment.
- `supabase`, `psql`, and `docker` are not installed or available on `PATH`.
- The migration files and schema passed the repository's static/mock tests, but no claim is made that the migrations or RPCs executed successfully against PostgreSQL.
- The new recommendation migration, arrival-date migration, route-task uniqueness, advance lease, publication RPC, private-preview read rules, and host-confirmation RPC remain unverified at database runtime.

## Fixed Supplier Coverage Plan

Status: **BLOCKED**.

- Operator-managed Amap, DeepSeek, gateway, and FlyAI configuration is present, but the missing Supabase environment prevents creating the required fresh persistent plan and tracing both published schemes back to stored `verified_quotes`.
- No direct gateway probe was counted as acceptance evidence. `/healthz`, one successful quote, or an unpersisted route set would not satisfy the coverage gate.
- Route fingerprints: none recorded.
- Supplier task outcomes, quote counts, error codes, cooldown timestamps, and coverage totals: not produced because the required persisted plan could not start.
- Required coverage still includes 2–6 participants, flight, high-speed rail, normal train, previous-day searches, an overnight arrival, and complete stored evidence for every selected participant route in both schemes.

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

1. Provision a disposable or operator-approved PostgreSQL/Supabase target and run all repository migrations plus the publication/confirmation RPC smoke without exposing credentials.
2. After supplier cooldown, create a fresh persistent 2–6 participant plan that satisfies the fixed mode/date coverage matrix and record only redacted route fingerprints, outcomes, counts, cooldown timestamps, coverage totals, and stable error codes.
3. Run the full H5 flow on a physical phone and repeat the layout check at approximately 390×844 and 1440×1000, including native date selection, completed one-city/two-scheme details, incomplete recovery, private preview privacy, and host-only idempotent confirmation.

Task 14 remains incomplete until all three blockers are cleared.
