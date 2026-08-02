# Reliable Baseline Production Acceptance

Date: 2026-08-02

## Outcome

The reliable-baseline migration, current Compose release, authenticated supplier gateway, both DeepSeek transports, background completion, terminal-state UX, retry boundary, and deterministic database replay are accepted in production. The final runtime is intentionally rolled back to the stable configuration: `deepseek-v4-flash`, primary `chat_completions`, shadow `off`, sample rate `0`.

This acceptance does not close the WeChat in-app-browser filing warning: the same canonical HTTPS URL opens normally in the phone system browser and the shipped footer exposes `京ICP备2026025115号-3`, but WeChat still presents an ICP safety interstitial before allowing continuation. Treat WeChat direct-open recovery as a residual distribution issue, not as a database, recommendation, or Compose acceptance failure.

## Backup and migration evidence

- Restorable custom-format PostgreSQL backup: `/Users/lixinyu/Documents/meetpoint-backups/meetpoint-pre-202608010001-20260802-112852.dump`.
- Size: 738,147 bytes; mode `0600`; SHA-256 `40434dd9639c4a0bf1d0c339faa34ab9112b67b94e230745a2262d7ce985a05b`.
- Restore rehearsal on PostgreSQL 17.10 passed: 666 archive entries, 16 public tables, 10 functions, 73 constraints, and migration history through `202607260001`.
- Preflight list and dry-run proposed `202607280001` followed by `202608010001`; both were applied through Supabase CLI 2.111.0.
- Final list records both migrations and the final dry-run reports the remote database up to date.
- Production postflight passed for the new columns and constraints, exact RPC signatures, security-invoker behavior, `anon`/`authenticated` denial, `service_role` execution, invalid-baseline rollback, invalid-priority rollback, and zero partial residue.

## ECS release and rollback evidence

- Pre-deploy server rollback archive: `/opt/meetpoint-backups/meetpoint-pre-dual-transport-20260802-192838.tar.gz`.
- Uploaded release SHA-256: `a5dd2e90efd0e6c5480879899a6c5b5ff1a91e2617c8d717cd514d69fcdf45ce`.
- Runtime-env backup: `/opt/meetpoint-backups/env-pre-dual-20260802-194515.production`.
- Compose configuration passed before deployment; all 38 image-build steps completed; `frontend`, `run-worker`, and private `travel-gateway` became healthy.
- Effective model was independently read as `deepseek-v4-flash`. The frontend remained bound to `127.0.0.1:3001`; the gateway retained no host port.
- Authenticated private-gateway smoke passed for `flight` and `high_speed_rail`: HTTP 200, 10 normalized options each, and trace identifiers present.

## DeepSeek transport evidence

- A production-network paired probe passed all three manager/calculation/supervisor calls on both Chat Completions and Responses; no timeout, unavailable, 4xx, or 5xx outcome occurred.
- A bounded real shadow call used Chat as primary and Responses as shadow. Both outputs qualified; the shadow emitted only redacted telemetry and did not write business state.
- The affected services were switched to Responses and recreated healthy; an in-container primary smoke returned `primaryTransport=responses` and `primaryQualified=true`.
- The one-variable rollback changed only `DEEPSEEK_TRANSPORT` to `chat_completions`; both services recreated healthy and an in-container smoke returned `primaryTransport=chat_completions` and `primaryQualified=true`.
- Final effective runtime: Chat primary, shadow off, sample rate zero.

## Fresh production plans

### Completed live-fare flow: `B1PGOO`

- Mainland-phone participants: Beijing and Zhanjiang; Zhanjiang persisted as canonical `amap-440800` with coordinates `21.270108, 110.357538`.
- Baseline city `wuhan` appeared before fare completion under policy `2026-08-01.baseline.v1`.
- The browser was closed while 48 tasks were running; the private worker completed the run without an open tab.
- Candidate-first priorities were complete and unique: 48 non-null values, 48 distinct values, range 0–47. Early-stop state was 3 succeeded, 1 empty, and 44 pending.
- Shared result: Wuhan; saving ¥940, fast ¥950; two routes per scheme and four persisted route rows.
- Participant evidence, physical FlyAI quote identifiers, provider facts, and city facts all matched persisted verified evidence.
- A transaction-wrapped rerun of `private.recommendation_policy_projection` reproduced the persisted city, aggregates, quote maps, route count, and exact totals; the verification transaction ended with `ROLLBACK` and `live_replay_postflight=PASS`.

### Incomplete flow: `2N4UPO`

- Beijing and Zhongshan (`amap-442000`), flight only.
- The background worker exhausted all 48 tasks and terminated `incomplete` with safe diagnostic `REAL_QUOTE_COVERAGE_INCOMPLETE`.
- The mobile-size production page retained the Wuhan baseline, showed actionable retry guidance, and exposed no fare or shared scheme.

### Failed flow and retry: `71WJ0V` / `FPVSTV`

- A single acceptance run was given an invalid run-local policy version while the global worker and environment stayed healthy. It terminated `failed` with safe public diagnostic `RUN_ADVANCE_FAILED`, retained the Wuhan baseline, and published no shared result.
- The mobile-size page showed terminal failure guidance and `重新查询`, with no fare claims.
- A separate credentialed retry acceptance created a new run (`HTTP 202`, `newRun=true`) instead of advancing the terminal run. The retry completed and published a shared result.

## Remaining operational work

- Resolve or appeal the WeChat direct-open ICP classification and repeat direct-link acceptance after Tencent propagation/review.
- Wire the documented redacted log alerts and scheduled coverage/divergence checks into an external alerting destination.
- A second commercial supplier remains unprocured and disabled; no failover claim is made.
- No git push, credential rotation, release-worktree deletion, or safety-stash deletion was performed.

## Final local gates

- Web: lint passed; 79 test files / 518 tests passed; Next.js production build passed.
- Travel gateway: lint passed; 8 test files / 133 tests passed; TypeScript build passed.
- `git diff --check` passed.
- The first sandboxed Web build attempt was blocked only because Turbopack could not bind its internal local port (`Operation not permitted`); the identical build passed outside that sandbox restriction.
