import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  planSingle: vi.fn(),
  participantsEq: vi.fn(),
  runsLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

function mockPlanLookup(plan: { id: string; code: string; title: string } | null) {
  mocks.planSingle.mockResolvedValue({ data: plan });
  const single = vi.fn(() => mocks.planSingle());
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, single };
}

function mockParticipantsLookup(participants: unknown[] | null) {
  mocks.participantsEq.mockResolvedValue({ data: participants });
  const select = vi.fn(() => ({ eq: mocks.participantsEq }));
  return { select };
}

function mockLatestRunLookup(run: unknown | null) {
  mocks.runsLimit.mockResolvedValue({ data: run ? [run] : [] });
  const order = vi.fn(() => ({ limit: mocks.runsLimit }));
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, order, limit: mocks.runsLimit };
}

describe("GET /api/plans/[code]", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.planSingle.mockReset();
    mocks.participantsEq.mockReset();
    mocks.runsLimit.mockReset();
  });

  it("returns not found when the plan code does not exist", async () => {
    const planLookup = mockPlanLookup(null);
    mocks.from.mockReturnValueOnce({ select: planLookup.select });

    const { GET } = await import("@/app/api/plans/[code]/route");
    const response = await GET(new Request("http://localhost/api/plans/NOPE"), {
      params: Promise.resolve({ code: "NOPE" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "PLAN_NOT_FOUND" });
    expect(planLookup.eq).toHaveBeenCalledWith("code", "NOPE");
  });

  it("returns plan details with participants and latest run", async () => {
    const plan = {
      id: "plan-1",
      code: "ABC123",
      title: "上海周末见面",
    };
    const participants = [
      {
        id: "participant-1",
        name: "李雷",
        departure_city_name: "北京",
        accepted_modes: ["flight"],
      },
    ];
    const latestRun = {
      id: "run-1",
      plan_id: "plan-1",
      status: "completed",
      started_at: "2026-08-01T10:00:00.000Z",
    };
    const planLookup = mockPlanLookup(plan);
    const participantLookup = mockParticipantsLookup(participants);
    const latestRunLookup = mockLatestRunLookup(latestRun);
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: participantLookup.select })
      .mockReturnValueOnce({ select: latestRunLookup.select });

    const { GET } = await import("@/app/api/plans/[code]/route");
    const response = await GET(new Request("http://localhost/api/plans/ABC123"), {
      params: Promise.resolve({ code: "ABC123" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plan,
      participants,
      latestRun,
    });
    expect(participantLookup.select).toHaveBeenCalledWith("*");
    expect(mocks.participantsEq).toHaveBeenCalledWith("plan_id", "plan-1");
    expect(latestRunLookup.order).toHaveBeenCalledWith("started_at", {
      ascending: false,
    });
    expect(latestRunLookup.limit).toHaveBeenCalledWith(1);
  });
});
