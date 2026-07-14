import { describe, expect, it, vi } from "vitest";

import { FifoLimiter } from "../src/limiter.js";

describe("FifoLimiter", () => {
  it("runs one default job at a time and starts queued jobs in FIFO order", async () => {
    const limiter = new FifoLimiter();
    const started: number[] = [];
    const releases: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;

    const jobs = Array.from({ length: 3 }, (_, index) => limiter.run(async () => {
      started.push(index);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases[index] = resolve);
      active -= 1;
      return index;
    }));

    await Promise.resolve();
    expect(started).toEqual([0]);
    expect(maximumActive).toBe(1);

    releases[0]!();
    await vi.waitFor(() => expect(started).toEqual([0, 1]));
    releases[1]!();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2]));
    releases[2]!();
    await expect(Promise.all(jobs)).resolves.toEqual([0, 1, 2]);
    expect(maximumActive).toBe(1);
  });
});
