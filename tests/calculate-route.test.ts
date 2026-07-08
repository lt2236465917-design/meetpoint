import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyManagementTokenForPlan: vi.fn(),
  calculatePlanRecommendations: vi.fn(),
}));

vi.mock("@/lib/security/management-token", () => ({
  verifyManagementTokenForPlan: mocks.verifyManagementTokenForPlan,
}));

vi.mock("@/lib/recommendation/calculate-run", () => ({
  calculatePlanRecommendations: mocks.calculatePlanRecommendations,
}));

describe("POST /api/plans/[code]/calculate", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyManagementTokenForPlan.mockReset();
    mocks.calculatePlanRecommendations.mockReset();
  });

  it("rejects requests without a valid management token", async () => {
    mocks.verifyManagementTokenForPlan.mockResolvedValue({
      ok: false,
      status: 403,
      error: "INVALID_MANAGEMENT_TOKEN",
    });

    const { POST } = await import("@/app/api/plans/[code]/calculate/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/calculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_MANAGEMENT_TOKEN",
    });
    expect(mocks.verifyManagementTokenForPlan).toHaveBeenCalledWith(
      "ABC123",
      null,
    );
    expect(mocks.calculatePlanRecommendations).not.toHaveBeenCalled();
  });

  it("calculates recommendations for verified hosts", async () => {
    mocks.verifyManagementTokenForPlan.mockResolvedValue({
      ok: true,
      planId: "plan-1",
    });
    mocks.calculatePlanRecommendations.mockResolvedValue({
      runId: "run-1",
      candidateCount: 12,
    });

    const { POST } = await import("@/app/api/plans/[code]/calculate/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/calculate", {
        method: "POST",
        headers: { "x-management-token": "secret-token" },
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId: "run-1",
      candidateCount: 12,
    });
    expect(mocks.verifyManagementTokenForPlan).toHaveBeenCalledWith(
      "ABC123",
      "secret-token",
    );
    expect(mocks.calculatePlanRecommendations).toHaveBeenCalledWith({
      code: "ABC123",
    });
  });
});
