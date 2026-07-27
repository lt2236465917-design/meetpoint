import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createFallbackPlan,
  resetFallbackStoreForTests,
} from "@/lib/fallback/mvp-store";

describe("fallback plan code creation", () => {
  beforeEach(() => resetFallbackStoreForTests());

  it("stops after five collisions instead of searching without a bound", async () => {
    const random = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.2);
    try {
      await createFallbackPlan({
        title: "第一份计划",
        arrivalDate: "2026-08-15",
        participantLimit: 2,
      });
      await expect(createFallbackPlan({
        title: "碰撞计划",
        arrivalDate: "2026-08-15",
        participantLimit: 2,
      })).rejects.toThrow("PLAN_CODE_EXHAUSTED");
    } finally {
      random.mockRestore();
    }
  });
});
