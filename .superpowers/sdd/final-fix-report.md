# Final Review Fix Report: Background Recommendation Run Worker

**Date:** 2026-07-28  
**Finding:** Heartbeat/healthcheck false-unhealthy during long advances  
**Status:** fixed

## Problem

Heartbeat was written only after each `runWorkerTick` finished (`tick → heartbeat → sleep`). Compose healthcheck fails when heartbeat mtime is older than 30s (`deploy/aliyun/compose.yaml`). A normal collecting/calculating `advanceRun` can exceed 30s, so a busy worker looked unhealthy during leave-and-finish.

## Fix

In `src/worker/recommendation-run-worker.ts`:

1. Start an independent `setInterval` every 10s that writes the heartbeat file for process lifetime.
2. Write once immediately on startup before the loop.
3. Clear the interval on SIGTERM/SIGINT and in a `finally` after loop exit.
4. Keep loop `onHeartbeat` as a belt-and-suspenders write after each tick.

Did **not** raise the Compose healthcheck threshold. Did **not** invent a second advance pipeline.

## Verification

```
npx vitest run tests/run-worker.test.ts tests/aliyun-deployment-config.test.ts -v
```

Result: **PASS** — 2 files / 13 tests.

Entry wiring reviewed manually (interval + signal clear + finally clear + post-tick `onHeartbeat`).

## Accepted v1 limitation (unchanged)

**cooling_down head-of-line with `maxInFlight=1`:** Plan still requires calling `advanceRun` for `cooling_down` runs. Selection does not skip `cooling_down`. A cooling_down run can sit at the head of the queue and delay other advanceable work until the cooldown path returns. This remains an accepted v1 limitation — not fixed in this change.

## Out of scope (untouched)

- Host confirmation / `confirm_alternative_result`
- Compose ports
- Unrelated minor findings
