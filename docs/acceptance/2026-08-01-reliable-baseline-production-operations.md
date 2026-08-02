# Reliable Baseline Production Operations Report

Date: 2026-08-01

> Historical pre-production boundary. The blocked migration, deployment, transport, and phone-flow work was completed on 2026-08-02. Current evidence: `docs/acceptance/2026-08-02-reliable-baseline-production-acceptance.md`. The WeChat direct-open ICP interstitial remains a documented residual.

## Status summary

| Area | Implemented locally | Production verified | External/manual action |
| --- | --- | --- | --- |
| Reliable baseline + FlyAI enum fix | Yes | No deployment | Apply migration and deploy |
| DeepSeek Responses capability | Yes; 102-pair gate passed | Not selected/deployed | Inspect ECS env, shadow/rollback smoke |
| Supabase migration `202608010001` | SQL + 6/76 disposable tests | Not applied | Obtain restorable backup, then push/smoke |
| FlyAI flight/train contract | Yes | Credentialed canary passed locally against live provider | Repeat inside deployed gateway after deploy |
| Second commercial provider | Capability seam only | No | Procurement, credentials, implementation, acceptance |
| Monitoring | Safe structured events + operator thresholds documented | External alert routing not configured | Wire Docker/log platform and scheduled database checks |
| New production plan/phone acceptance | UI and behavior tested locally | Not run | Requires migration + deployment + real phone |

No git push occurred. No production database schema, ECS service, credential, or production plan was changed. Supabase credentials were not rotated; the prior operator waiver remains unchanged.

The preceding table and sentence describe the 2026-08-01 cutoff, not current production state.

## Final local release gates

Fresh verification after the recovery layer, dual transport, shadow comparison, and monitoring changes:

- travel gateway: lint passed; 8 files / 133 tests passed; TypeScript build passed;
- Web app: lint passed; 79 files / 518 tests passed; production build passed;
- disposable PostgreSQL 17.10: 6 files / 76 tests passed, including migration, role denial, transaction rollback, deterministic replay, and canonical-schema checks;
- `git diff --check` passed;
- the disposable database server was stopped after the run.

Compared with the authoritative recovery baseline, the gateway remains 8 / 133 and PostgreSQL remains 6 / 76. The Web app increase from 78 / 513 to 79 / 518 is the DeepSeek paired-comparison test file plus five failing-first transport/shadow/telemetry regressions; no recovered coverage was removed.

## DeepSeek production model audit

- Repository default: `deepseek-v4-flash`, current official model version DeepSeek-V4-Flash-0731.
- Application protocol before this work: Chat Completions.
- Historical production `agent_events` through 2026-07-20 record `deepseek-v4-flash` requested/completed events.
- The local operator credential successfully called the same model through both protocols; detailed 102-pair evidence is in `docs/acceptance/2026-08-01-deepseek-transport-comparison.md`.
- The local operator env has no `DEEPSEEK_MODEL` override. This does not prove current ECS env has no override.
- No SSH/Workbench endpoint or connected authenticated browser was available, so current ECS `DEEPSEEK_MODEL` and `DEEPSEEK_TRANSPORT` could not be independently read. Production remains Chat by documented/default intent, but current runtime selection is **not freshly proven**.

## Supabase migration preflight

- Project `meetpoint` is `ACTIVE_HEALTHY`, PostgreSQL 17, region `ap-northeast-1`.
- Remote migration history contains `202607080001` through `202607260001`.
- Remote history does not record `202607280001` even though the leave-and-finish acceptance says its SQL was applied manually in SQL Editor. This is a migration-history gap, not proof the 2-hour function is absent.
- Official `db push --dry-run` would apply, in order:
  1. `202607280001_extend_active_run_stale_window.sql`
  2. `202608010001_reliable_baseline_recommendation.sql`
- The 20260728 migration is `create or replace` and locally idempotent. The 20260801 migration is additive plus a guarded participant RPC replacement; disposable PostgreSQL migration/permission/behavior tests passed.
- Supabase backup listing returned no restorable backup rows, `pitr_enabled=false`, and `walg_enabled=true`. Logical schema dump failed because CLI requires Docker and this machine has no Docker; direct `pg_dump` could not authenticate because the temporary pooler URL intentionally omitted the password.
- Because the delegated sequence requires a backup before schema change, `db push` was not executed. Required operator unblock: provide the database password securely for a logical `pg_dump`, install/enable Docker for official `supabase db dump`, or confirm a restorable Dashboard backup. Do not paste the password into chat or repository files.

After backup is available, run migration list + dry-run again, apply both pending migrations, then verify:

1. participant latitude/longitude and run baseline columns;
2. baseline completeness and coordinate/priority constraints;
3. exact signatures for `create_participant_with_credential`, `ensure_run_baseline`, and `ensure_run_task_priorities`;
4. `anon` and `authenticated` cannot execute any of those functions or read business tables;
5. `service_role` can execute them;
6. rollback-safe smoke: invalid baseline mutation rolls back, invalid priority coverage rolls back, and no partial run/result rows remain;
7. migration history records both 202607280001 and 202608010001.

## FlyAI credentialed canary

The live, redacted `npm run probe:contract` executed the production normalizer:

- `flight` / supplier `飞机`: `ok`, 10 normalized options, 1477 ms.
- `high_speed_rail` / supplier `火车`: `ok`, 9 normalized options, 1441 ms.

This proves the two sampled contracts and the Chinese enum fix. It does not prove every route/date, supplier SLA, or complete recommendation coverage. `/healthz` remains process reachability only; a post-deploy authenticated `/v1/search` smoke is still required.

## Second-provider procurement and integration gate

No second commercial provider adapter, credential, contract identifier, or environment variable exists. Failover remains disabled.

Procurement/configuration checklist:

1. Licensed mainland-China flight and rail search rights, including production display/use of fares and schedule facts.
2. Sandbox and production credentials, documented IP allowlist, quota, concurrency, rate-limit, timeout, support, and SLA terms.
3. Direct and connecting itinerary schemas, stable physical quote identifier, currency/fare semantics, service/station fields, booking-host allowlist, and freshness/expiry contract.
4. Provider health and incident channel, schema-change notification process, and test routes/dates for both modes.
5. Legal/privacy confirmation that only canonical city/mode/date search facts are transmitted.

Integration acceptance:

- Normalize to the same gateway contract with explicit `provider`, provenance, and `queriedAt`.
- Reject mixed mode, out-of-order/overlapping segments, more than eight segments, missing fare/time/service facts, stale cache, and unapproved booking hosts.
- Health routing must distinguish credential/config failure, rate limit, schema drift, timeout, no-route, and no-ticket.
- Cache freshness must be provider-specific and never publish an expired quote as current.
- Fault-injection must prove primary failure can select secondary only when configured, while no-provider mode remains fail closed.
- Both providers must pass the same participant/date/mode evidence checks, `(participantId, quoteId)` identity, transaction materialization, database policy replay, and complete-coverage publication guard.

## Monitoring actions

Implemented structured, redacted events:

- `flyai_diagnostic` with route fingerprint, mode, normalized/dropped counts, allowlisted dropped reasons, and stable outcome.
- `schema_drift_circuit_open` with provider, allowlisted signature, and TTL.
- `schema_drift_circuit_short_circuit` for fail-fast searches.
- `deepseek_shadow` with transport/agent, schema qualification, latency, token totals, retry/stable error, and safe HTTP/category fields.

External alert routing is not available from this workspace. Operator actions:

1. In the ECS log platform (or Docker log collector), alert immediately on any `schema_drift_circuit_open`; page when `PROVIDER_INVALID_RESPONSE` occurs twice with the same signature in 5 minutes.
2. Dashboard `flyai_diagnostic`: normalized success rate by mode, dropped-reason distribution, p95 latency, and rate-limit count. A `/healthz` success must never clear a failed authenticated search alert.
3. Hourly Supabase query over recent automatic runs: participant count, maximum per-city verified participant coverage, verified quote count, and terminal status. Alert when a completed run lacks complete coverage (critical) or the 24-hour incomplete ratio exceeds the agreed SLO.
4. Join automatic-run baseline city to the current shared result city and track divergence rate. Divergence is informational—not automatically wrong—because baseline uses geography/hubs and live result uses verified fares; alert only on missing baseline, missing completed live evidence, or a sudden distribution shift.
5. Until an external platform is wired, the on-call action is: inspect `docker compose logs --since=15m travel-gateway run-worker`, run the redacted contract probe, then query recent coverage. Never paste raw supplier output or credentials into an incident ticket.

## Deployment and phone acceptance blocker

The project deploys by syncing the verified tree to ECS `/opt/meetpoint` and rebuilding Compose; it does not deploy through git push. No SSH alias/key, Workbench endpoint, or authenticated Chrome session was available in this task, so the working tree could not be synced and current `/opt/meetpoint/deploy/aliyun/.env.production` could not be inspected.

Consequently the following remain unverified: current ECS model override, Responses shadow/kill switch, deployed FlyAI key, authenticated private-gateway search, new migration behavior, baseline-first production UI, fresh plan evidence, and mainland-phone rows. Production was deliberately left unchanged.
