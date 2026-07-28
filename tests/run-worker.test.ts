import { describe, expect, it } from "vitest";

import {
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
