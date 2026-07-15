import { describe, expect, it } from "vitest";

import { queryConcurrencyFromEnv, runQueryPool } from "@/lib/agent/query-pool";

describe("runQueryPool", () => {
  it("uses at most four logical workers by default", async () => {
    let active = 0;
    let maximum = 0;
    await runQueryPool(Array.from({ length: 12 }, (_, index) => `t${index}`), {
      execute: async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
      },
    });
    expect(maximum).toBe(4);
  });

  it("clamps configured concurrency to 1..8", () => {
    expect(queryConcurrencyFromEnv("0")).toBe(1);
    expect(queryConcurrencyFromEnv("99")).toBe(8);
    expect(queryConcurrencyFromEnv("not-a-number")).toBe(4);
  });

  it("uses the default when explicit concurrency is NaN", async () => {
    let calls = 0;
    await runQueryPool(["t1"], {
      logicalConcurrency: Number.NaN,
      execute: async () => { calls += 1; },
    });
    expect(calls).toBe(1);
  });

  it("stops claiming work after failure and waits for started workers", async () => {
    const started: string[] = [];
    const finished: string[] = [];
    const promise = runQueryPool(["t1", "t2", "t3", "t4"], {
      logicalConcurrency: 3,
      execute: async (taskId) => {
        started.push(taskId);
        if (taskId === "t1") throw new Error("boom");
        await new Promise((resolve) => setTimeout(resolve, 5));
        finished.push(taskId);
      },
    });

    await expect(promise).rejects.toThrow("boom");
    expect(started).toEqual(["t1", "t2", "t3"]);
    expect(finished).toEqual(expect.arrayContaining(["t2", "t3"]));
  });
});
