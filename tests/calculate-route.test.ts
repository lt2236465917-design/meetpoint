import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyParticipantCanCalculatePlan: vi.fn(),
  calculatePlanRecommendations: vi.fn(),
}));

vi.mock("@/lib/security/participant-calculation", () => ({
  verifyParticipantCanCalculatePlan: mocks.verifyParticipantCanCalculatePlan,
}));
vi.mock("@/lib/recommendation/calculate-run", () => ({
  calculatePlanRecommendations: mocks.calculatePlanRecommendations,
}));

describe("POST /api/plans/[code]/calculate", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.verifyParticipantCanCalculatePlan.mockReset();
    mocks.calculatePlanRecommendations.mockReset();
  });

  it("returns 202 after an authorized participant creates pending work", async () => {
    mocks.verifyParticipantCanCalculatePlan.mockResolvedValue({
      ok: true, planId: "plan-1", participantId: "participant-1",
    });
    mocks.calculatePlanRecommendations.mockResolvedValue({ runId: "run-1", status: "pending" });

    const { POST } = await import("@/app/api/plans/[code]/calculate/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/calculate", {
        method: "POST", headers: { "x-participant-token": "edit-token" },
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ runId: "run-1", status: "pending" });
    expect(mocks.calculatePlanRecommendations).toHaveBeenCalledWith({
      code: "ABC123", participantToken: "edit-token",
    });
  });

  it("does not create a run when participant authorization fails", async () => {
    mocks.verifyParticipantCanCalculatePlan.mockResolvedValue({
      ok: false, status: 409, error: "PARTICIPANT_LIMIT_NOT_REACHED",
    });
    const { POST } = await import("@/app/api/plans/[code]/calculate/route");
    const response = await POST(new Request("http://localhost/api/plans/ABC123/calculate", { method: "POST" }), {
      params: Promise.resolve({ code: "ABC123" }),
    });
    expect(response.status).toBe(409);
    expect(mocks.calculatePlanRecommendations).not.toHaveBeenCalled();
  });
});
