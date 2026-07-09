import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyToken } from "@/lib/security/tokens";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  planSingle: vi.fn(),
  countEq: vi.fn(),
  insert: vi.fn(),
  insertSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

function createValidRequest() {
  return new Request("http://localhost/api/plans/ABC123/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "李雷",
      departureCityCode: "shanghai",
      departureCityName: "上海",
      acceptedModes: ["high_speed_rail", "flight"],
    }),
  });
}

function mockPlanLookup(plan: { id: string; participant_limit: number } | null) {
  const single = mocks.planSingle.mockResolvedValue({ data: plan });
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, single };
}

function mockParticipantCount(count: number | null) {
  mocks.countEq.mockResolvedValue({ count });
  const select = vi.fn(() => ({ eq: mocks.countEq }));
  return { select };
}

function mockParticipantInsert(
  result: { data: { id: string } | null; error: unknown },
) {
  mocks.insertSingle.mockResolvedValue(result);
  const select = vi.fn(() => ({ single: mocks.insertSingle }));
  mocks.insert.mockReturnValue({ select });
  return { insert: mocks.insert, select, single: mocks.insertSingle };
}

describe("POST /api/plans/[code]/participants", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.planSingle.mockReset();
    mocks.countEq.mockReset();
    mocks.insert.mockReset();
    mocks.insertSingle.mockReset();
  });

  it("rejects invalid participant input", async () => {
    const { POST } = await import("@/app/api/plans/[code]/participants/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/participants", {
        method: "POST",
        body: JSON.stringify({ name: "", acceptedModes: [] }),
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_INPUT" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns not found when the plan code does not exist", async () => {
    const planLookup = mockPlanLookup(null);
    mocks.from.mockReturnValueOnce({ select: planLookup.select });

    const { POST } = await import("@/app/api/plans/[code]/participants/route");
    const response = await POST(createValidRequest(), {
      params: Promise.resolve({ code: "UNKNOWN" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "PLAN_NOT_FOUND" });
    expect(planLookup.eq).toHaveBeenCalledWith("code", "UNKNOWN");
  });

  it("rejects submissions after the participant limit is reached", async () => {
    const planLookup = mockPlanLookup({ id: "plan-1", participant_limit: 2 });
    const countLookup = mockParticipantCount(2);
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: countLookup.select });

    const { POST } = await import("@/app/api/plans/[code]/participants/route");
    const response = await POST(createValidRequest(), {
      params: Promise.resolve({ code: "ABC123" }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "PARTICIPANT_LIMIT_REACHED",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates a participant and returns an edit token", async () => {
    const planLookup = mockPlanLookup({ id: "plan-1", participant_limit: 4 });
    const countLookup = mockParticipantCount(1);
    const participantInsert = mockParticipantInsert({
      data: { id: "participant-1" },
      error: null,
    });
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: countLookup.select })
      .mockReturnValueOnce({ insert: participantInsert.insert });

    const { POST } = await import("@/app/api/plans/[code]/participants/route");
    const response = await POST(createValidRequest(), {
      params: Promise.resolve({ code: "ABC123" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ participantId: "participant-1" });
    expect(json.editToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const inserted = mocks.insert.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({
      plan_id: "plan-1",
      name: "李雷",
      departure_city_code: "shanghai",
      departure_city_name: "上海",
      accepted_modes: ["high_speed_rail", "flight"],
      created_by_host: false,
    });
    await expect(verifyToken(json.editToken, inserted.edit_token_hash)).resolves.toBe(
      true,
    );
  });
});
