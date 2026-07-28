import { describe, expect, it, vi } from "vitest";

import {
  runWorkerLoop,
  runWorkerTick,
  selectNextWorkerRun,
  isWorkerAdvanceableStatus,
  workerPollIntervalMs,
  workerHeartbeatPath,
  type WorkerAdvanceableRun,
} from "@/lib/recommendation/run-worker";

function run(
  overrides: Partial<WorkerAdvanceableRun> & Pick<WorkerAdvanceableRun, "id" | "startedAt">,
): WorkerAdvanceableRun {
  return {
    planId: "plan-1",
    status: "collecting",
    kind: "automatic",
    ...overrides,
  };
}

describe("recommendation run worker selection", () => {
  it("accepts only worker-advanceable statuses", () => {
    expect(isWorkerAdvanceableStatus("pending")).toBe(true);
    expect(isWorkerAdvanceableStatus("cooling_down")).toBe(true);
    expect(isWorkerAdvanceableStatus("awaiting_host_confirmation")).toBe(false);
    expect(isWorkerAdvanceableStatus("completed")).toBe(false);
    expect(isWorkerAdvanceableStatus("failed")).toBe(false);
  });

  it("selects the oldest started_at run and breaks ties by id", () => {
    const selected = selectNextWorkerRun([
      run({ id: "b", startedAt: "2026-07-28T01:00:00.000Z", kind: "alternative" }),
      run({ id: "a", startedAt: "2026-07-28T01:00:00.000Z" }),
      run({ id: "c", startedAt: "2026-07-28T02:00:00.000Z" }),
    ]);
    expect(selected?.id).toBe("a");
  });

  it("returns null when there is nothing to advance", () => {
    expect(selectNextWorkerRun([])).toBeNull();
  });
});

describe("recommendation run worker tick", () => {
  it("advances the oldest run and still calls advance during cooling_down", async () => {
    const advanceRun = vi.fn(async () => ({ status: "cooling_down" }));
    const selected = await runWorkerTick({
      listRuns: async () => [
        run({ id: "cool", status: "cooling_down", startedAt: "2026-07-28T00:00:00.000Z" }),
        run({ id: "later", startedAt: "2026-07-28T01:00:00.000Z" }),
      ],
      advanceRun,
    });
    expect(selected?.id).toBe("cool");
    expect(advanceRun).toHaveBeenCalledWith({ runId: "cool", planId: "plan-1" });
  });

  it("returns null without advancing when idle", async () => {
    const advanceRun = vi.fn();
    await expect(runWorkerTick({
      listRuns: async () => [],
      advanceRun,
    })).resolves.toBeNull();
    expect(advanceRun).not.toHaveBeenCalled();
  });

  it("logs and swallows unexpected advance failures so the loop can continue", async () => {
    const logError = vi.fn();
    const advanceRun = vi.fn(async () => {
      throw new Error("RUN_ADVANCE_FAILED");
    });
    await expect(runWorkerTick({
      listRuns: async () => [run({ id: "boom", startedAt: "2026-07-28T00:00:00.000Z" })],
      advanceRun,
      logError,
    })).resolves.toEqual(expect.objectContaining({ id: "boom" }));
    expect(logError).toHaveBeenCalledWith(
      "[recommendation-run-worker] advance failed",
      expect.objectContaining({ runId: "boom", planId: "plan-1" }),
    );
  });

  it("logs and swallows listRuns failures so the process does not exit", async () => {
    const logError = vi.fn();
    const advanceRun = vi.fn();
    await expect(runWorkerTick({
      listRuns: async () => {
        throw new Error("LIST_FAILED");
      },
      advanceRun,
      logError,
    })).resolves.toBeNull();
    expect(advanceRun).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      "[recommendation-run-worker] list failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("runs an immediate tick before the first sleep and stops on abort", async () => {
    const advanceRun = vi.fn(async () => ({ status: "collecting" }));
    const sleeps: number[] = [];
    const heartbeats: number[] = [];
    const controller = new AbortController();
    let ticks = 0;

    await runWorkerLoop({
      pollIntervalMs: 3_000,
      listRuns: async () => {
        ticks += 1;
        if (ticks >= 2) controller.abort();
        return [run({ id: `run-${ticks}`, startedAt: "2026-07-28T00:00:00.000Z" })];
      },
      advanceRun,
      signal: controller.signal,
      onHeartbeat: async () => {
        heartbeats.push(ticks);
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(advanceRun).toHaveBeenCalled();
    expect(heartbeats[0]).toBe(1);
    expect(sleeps[0]).toBe(3_000);
  });
});

describe("recommendation run worker env helpers", () => {
  it("defaults poll interval to 3s and rejects out-of-range values", () => {
    expect(workerPollIntervalMs({})).toBe(3_000);
    expect(workerPollIntervalMs({ RUN_WORKER_POLL_INTERVAL_MS: "5000" })).toBe(5_000);
    expect(() => workerPollIntervalMs({ RUN_WORKER_POLL_INTERVAL_MS: "100" })).toThrow(
      /RUN_WORKER_POLL_INTERVAL_MS/,
    );
  });

  it("defaults the heartbeat path", () => {
    expect(workerHeartbeatPath({})).toBe("/tmp/run-worker-heartbeat");
    expect(workerHeartbeatPath({ RUN_WORKER_HEARTBEAT_PATH: "/tmp/x" })).toBe("/tmp/x");
  });
});
