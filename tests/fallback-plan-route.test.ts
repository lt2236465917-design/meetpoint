import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetFallbackStoreForTests } from "@/lib/fallback/mvp-store";

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => false,
  createServiceSupabaseClient: vi.fn(),
}));

function planRequest(title: string) {
  return new Request("http://localhost/api/plans", {
    method: "POST",
    body: JSON.stringify({
      title,
      arrivalDate: "2026-08-15",
      participantLimit: 2,
    }),
  });
}

describe("fallback POST /api/plans", () => {
  beforeEach(() => resetFallbackStoreForTests());

  it("maps bounded code exhaustion to actionable 503 guidance", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0.1);
    try {
      const { POST } = await import("@/app/api/plans/route");
      expect((await POST(planRequest("第一份计划"))).status).toBe(200);

      const response = await POST(planRequest("碰撞计划"));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "PLAN_CODE_EXHAUSTED",
      });
    } finally {
      random.mockRestore();
    }
  });
});
