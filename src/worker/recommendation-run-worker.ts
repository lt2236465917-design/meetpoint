import { writeFile } from "node:fs/promises";

import { advanceRun } from "@/lib/agent/run-orchestrator";
import { SupabaseRecommendationRepository } from "@/lib/recommendation/repository";
import {
  runWorkerLoop,
  workerHeartbeatPath,
  workerPollIntervalMs,
} from "@/lib/recommendation/run-worker";
import { hasSupabaseEnvironment } from "@/lib/supabase/server";

/** Keep Compose healthchecks green while a long advanceRun holds the tick. */
const HEARTBEAT_INTERVAL_MS = 10_000;

async function main(): Promise<void> {
  if (!hasSupabaseEnvironment()) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.TRAVEL_GATEWAY_URL || !process.env.TRAVEL_GATEWAY_TOKEN) {
    throw new Error("Missing TRAVEL_GATEWAY_URL or TRAVEL_GATEWAY_TOKEN");
  }

  const repository = new SupabaseRecommendationRepository();
  const heartbeatPath = workerHeartbeatPath();
  const controller = new AbortController();

  const writeHeartbeat = async () => {
    await writeFile(heartbeatPath, `${Date.now()}\n`, "utf8");
  };

  // Independent of tick/advance duration — load-bearing for healthcheck freshness.
  await writeHeartbeat();
  const heartbeatTimer = setInterval(() => {
    void writeHeartbeat().catch((error) => {
      console.error("[recommendation-run-worker] heartbeat write failed", error);
    });
  }, HEARTBEAT_INTERVAL_MS);

  const stop = () => {
    clearInterval(heartbeatTimer);
    controller.abort();
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  console.info("[recommendation-run-worker] starting", {
    pollIntervalMs: workerPollIntervalMs(),
    heartbeatPath,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
  });

  try {
    await runWorkerLoop({
      pollIntervalMs: workerPollIntervalMs(),
      signal: controller.signal,
      listRuns: () => repository.listWorkerAdvanceableRuns(),
      advanceRun: (input) => advanceRun(input),
      // Belt-and-suspenders write after each tick; interval covers long advances.
      onHeartbeat: writeHeartbeat,
    });
  } finally {
    clearInterval(heartbeatTimer);
  }
}

main().catch((error) => {
  console.error("[recommendation-run-worker] fatal", error);
  process.exitCode = 1;
});
