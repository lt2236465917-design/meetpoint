import { writeFile } from "node:fs/promises";

import { advanceRun } from "@/lib/agent/run-orchestrator";
import { SupabaseRecommendationRepository } from "@/lib/recommendation/repository";
import {
  runWorkerLoop,
  workerHeartbeatPath,
  workerPollIntervalMs,
} from "@/lib/recommendation/run-worker";
import { hasSupabaseEnvironment } from "@/lib/supabase/server";

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
  const stop = () => controller.abort();
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  console.info("[recommendation-run-worker] starting", {
    pollIntervalMs: workerPollIntervalMs(),
    heartbeatPath,
  });

  await runWorkerLoop({
    pollIntervalMs: workerPollIntervalMs(),
    signal: controller.signal,
    listRuns: () => repository.listWorkerAdvanceableRuns(),
    advanceRun: (input) => advanceRun(input),
    onHeartbeat: async () => {
      await writeFile(heartbeatPath, `${Date.now()}\n`, "utf8");
    },
  });
}

main().catch((error) => {
  console.error("[recommendation-run-worker] fatal", error);
  process.exitCode = 1;
});
