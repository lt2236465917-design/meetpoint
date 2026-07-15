import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  planSingle: vi.fn(),
  participantsEq: vi.fn(),
  runsLimit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

function mockPlanLookup(plan: Record<string, unknown> | null) {
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

function mockPendingGroups(count: number) {
  const inStatus = vi.fn().mockResolvedValue({ count });
  const eq = vi.fn(() => ({ in: inStatus }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, inStatus };
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
      meeting_date: "2026-08-15",
      participant_limit: 2,
      status: "collecting",
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
      status: "collecting",
      trace_id: "11111111-1111-4111-8111-111111111111",
      retry_after: null,
      error_summary: null,
    };
    const planLookup = mockPlanLookup(plan);
    const participantLookup = mockParticipantsLookup(participants);
    const latestRunLookup = mockLatestRunLookup(latestRun);
    const pendingGroups = mockPendingGroups(3);
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: participantLookup.select })
      .mockReturnValueOnce({ select: latestRunLookup.select })
      .mockReturnValueOnce({ select: pendingGroups.select });

    const { GET } = await import("@/app/api/plans/[code]/route");
    const response = await GET(new Request("http://localhost/api/plans/ABC123"), {
      params: Promise.resolve({ code: "ABC123" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      plan: {
        code: "ABC123",
        title: "上海周末见面",
        meeting_date: "2026-08-15",
        participant_limit: 2,
        status: "collecting",
      },
      participants,
      latestRun: {
        status: "collecting",
        traceId: "11111111-1111-4111-8111-111111111111",
        pendingGroups: 3,
        retryAt: null,
        diagnosticCode: null,
      },
      latestSharedResult: null,
    });
    expect(planLookup.select).toHaveBeenCalledWith(
      "id, code, title, meeting_date, participant_limit, status",
    );
    expect(participantLookup.select).toHaveBeenCalledWith(
      "id, name, departure_city_name, accepted_modes",
    );
    expect(mocks.participantsEq).toHaveBeenCalledWith("plan_id", "plan-1");
    expect(latestRunLookup.order).toHaveBeenCalledWith("started_at", {
      ascending: false,
    });
    expect(latestRunLookup.limit).toHaveBeenCalledWith(1);
    expect(latestRunLookup.select).toHaveBeenCalledWith("id, status, trace_id, retry_after, error_summary, started_at");
    expect(pendingGroups.inStatus).toHaveBeenCalledWith("status", ["pending", "running", "retryable_failure"]);
  });
});
