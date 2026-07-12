import { describe, expect, it, vi } from "vitest";

import { FifoLimiter } from "../src/limiter.js";

describe("FifoLimiter", () => {
  it("runs no more than four jobs and starts queued jobs in FIFO order", async () => {
    const limiter = new FifoLimiter();
    const started: number[] = [];
    const releases: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;

    const jobs = Array.from({ length: 7 }, (_, index) => limiter.run(async () => {
      started.push(index);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => releases[index] = resolve);
      active -= 1;
      return index;
    }));

    await Promise.resolve();
    expect(started).toEqual([0, 1, 2, 3]);
    expect(maximumActive).toBe(4);

    releases[1]!();
    await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3, 4]));

    for (const release of releases) release?.();
    await vi.waitFor(() => expect(started.length).toBe(7));
    for (const release of releases) release?.();
    await expect(Promise.all(jobs)).resolves.toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(maximumActive).toBe(4);
  });
});
