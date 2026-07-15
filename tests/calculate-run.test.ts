import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startAutomaticRun: vi.fn(),
}));

vi.mock("@/lib/agent/run-orchestrator", () => ({
  startAutomaticRun: mocks.startAutomaticRun,
}));
vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
}));

describe("calculatePlanRecommendations", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.startAutomaticRun.mockReset();
  });

  it("creates bounded pending work and never waits for supplier collection", async () => {
    mocks.startAutomaticRun.mockResolvedValue({ runId: "run-1", status: "pending" });

    const { calculatePlanRecommendations } = await import("@/lib/recommendation/calculate-run");
    await expect(calculatePlanRecommendations({
      code: "ABC123",
      participantToken: "participant-token",
    })).resolves.toEqual({ runId: "run-1", status: "pending" });

    expect(mocks.startAutomaticRun).toHaveBeenCalledWith({
      code: "ABC123",
      participantToken: "participant-token",
    });
  });
});
