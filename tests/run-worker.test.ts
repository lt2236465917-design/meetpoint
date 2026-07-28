import { describe, expect, it, vi } from "vitest";

import {
  runWorkerLoop,
  runWorkerTick,
  selectNextWorkerRun,
  isWorkerAdvanceableStatus,
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
