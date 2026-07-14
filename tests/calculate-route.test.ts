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

  it("rejects requests from browsers that have not filled the plan", async () => {
    mocks.verifyParticipantCanCalculatePlan.mockResolvedValue({
      ok: false,
      status: 401,
      error: "PARTICIPANT_TOKEN_REQUIRED",
    });

    const { POST } = await import("@/app/api/plans/[code]/calculate/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/calculate", {
        method: "POST",
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "PARTICIPANT_TOKEN_REQUIRED",
    });
    expect(mocks.verifyParticipantCanCalculatePlan).toHaveBeenCalledWith({
      code: "ABC123",
      participantToken: null,
    });
    expect(mocks.calculatePlanRecommendations).not.toHaveBeenCalled();
  });

  it("rejects filled participants until the plan reaches its participant limit", async () => {
    mocks.verifyParticipantCanCalculatePlan.mockResolvedValue({
      ok: false,
      status: 409,
      error: "PARTICIPANT_LIMIT_NOT_REACHED",
    });

    const { POST } = await import("@/app/api/plans/[code]/calculate/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/calculate", {
        method: "POST",
        headers: { "x-participant-token": "edit-token" },
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "PARTICIPANT_LIMIT_NOT_REACHED",
    });
    expect(mocks.calculatePlanRecommendations).not.toHaveBeenCalled();
  });

  it("calculates recommendations for filled participants after the plan is full", async () => {
    mocks.verifyParticipantCanCalculatePlan.mockResolvedValue({
      ok: true,
      planId: "plan-1",
      participantId: "participant-1",
    });
    mocks.calculatePlanRecommendations.mockResolvedValue({
      runId: "run-1",
      candidateCount: 12,
    });

    const { POST } = await import("@/app/api/plans/[code]/calculate/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/calculate", {
        method: "POST",
        headers: { "x-participant-token": "edit-token" },
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runId: "run-1",
      candidateCount: 12,
    });
    expect(mocks.verifyParticipantCanCalculatePlan).toHaveBeenCalledWith({
      code: "ABC123",
      participantToken: "edit-token",
    });
    expect(mocks.calculatePlanRecommendations).toHaveBeenCalledWith({
      code: "ABC123",
    });
  });

  it("returns an in-progress conflict after a participant is authorized", async () => {
    mocks.verifyParticipantCanCalculatePlan.mockResolvedValue({
      ok: true,
      planId: "plan-1",
      participantId: "participant-1",
    });
    mocks.calculatePlanRecommendations.mockRejectedValue(
      new Error("CALCULATION_IN_PROGRESS"),
    );

    const { POST } = await import("@/app/api/plans/[code]/calculate/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/calculate", {
        method: "POST",
        headers: { "x-participant-token": "edit-token" },
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "CALCULATION_IN_PROGRESS",
    });
  });
});
