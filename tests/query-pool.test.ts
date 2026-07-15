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
});
