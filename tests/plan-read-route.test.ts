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
  const kindEq = vi.fn(() => ({ order }));
  const planEq = vi.fn(() => ({ eq: kindEq }));
  const select = vi.fn(() => ({ eq: planEq }));
  return { select, planEq, kindEq, order, limit: mocks.runsLimit };
}

function mockRunProjectionLookup(runs: Array<Record<string, unknown>>) {
  const filters = new Map<string, unknown>();
  type RunQueryBuilder = {
    eq: (column: string, value: unknown) => RunQueryBuilder;
    order: (column: string, options: unknown) => RunQueryBuilder;
    limit: (count: number) => Promise<{ data: Array<Record<string, unknown>> }>;
  };
  const builder: RunQueryBuilder = {
    eq: vi.fn((column: string, value: unknown) => {
      filters.set(column, value);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(async (count: number) => {
      const filtered = runs
        .filter((run) => [...filters].every(([key, value]) => run[key] === value))
        .sort((left, right) => String(right.started_at).localeCompare(String(left.started_at)));
      return { data: filtered.slice(0, count) };
    }),
  };
  const select = vi.fn(() => builder);
  return { select, ...builder };
}

function mockCurrentSharedLookup(result: unknown | null) {
  const limit = vi.fn().mockResolvedValue({ data: result ? [result] : [] });
  const isNull = vi.fn(() => ({ limit }));
  const sharedEq = vi.fn(() => ({ is: isNull }));
  const planEq = vi.fn(() => ({ eq: sharedEq }));
  const select = vi.fn(() => ({ eq: planEq }));
  return { select, planEq, sharedEq, isNull, limit };
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
    const currentSharedLookup = mockCurrentSharedLookup(null);
    const latestRunLookup = mockLatestRunLookup(latestRun);
    const pendingGroups = mockPendingGroups(3);
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: participantLookup.select })
      .mockReturnValueOnce({ select: currentSharedLookup.select })
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
        runId: "run-1",
        status: "collecting",
        traceId: "11111111-1111-4111-8111-111111111111",
        pendingGroups: 3,
        retryAt: null,
        diagnosticCode: null,
        baseline: null,
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
    expect(currentSharedLookup.sharedEq).toHaveBeenCalledWith("is_shared", true);
    expect(currentSharedLookup.isNull).toHaveBeenCalledWith("superseded_at", null);
    expect(latestRunLookup.kindEq).toHaveBeenCalledWith("kind", "automatic");
    expect(latestRunLookup.order).toHaveBeenCalledWith("started_at", {
      ascending: false,
    });
    expect(latestRunLookup.limit).toHaveBeenCalledWith(1);
    expect(latestRunLookup.select).toHaveBeenCalledWith("id, status, trace_id, retry_after, error_summary, started_at,baseline_city_code,baseline_city_name,baseline_policy_version,baseline_evidence_level,baseline_input_fingerprint");
    expect(pendingGroups.inStatus).toHaveBeenCalledWith("status", ["pending", "running", "retryable_failure"]);
  });

  it("anchors a shared result to its owning run instead of a newer private preview", async () => {
    const plan = {
      id: "plan-1",
      code: "ABC123",
      title: "上海周末见面",
      meeting_date: "2026-08-15",
      participant_limit: 2,
      status: "completed",
    };
    const sharedRun = {
      id: "run-shared",
      plan_id: "plan-1",
      kind: "automatic",
      status: "completed",
      trace_id: "11111111-1111-4111-8111-111111111111",
      retry_after: null,
      error_summary: null,
      started_at: "2026-08-01T00:00:00.000Z",
    };
    const newerPrivatePreview = {
      id: "run-private",
      plan_id: "plan-1",
      kind: "alternative",
      status: "awaiting_host_confirmation",
      trace_id: "22222222-2222-4222-8222-222222222222",
      retry_after: null,
      error_summary: null,
      started_at: "2026-08-02T00:00:00.000Z",
      requested_by_participant_id: "participant-private",
      requested_city_code: "310100",
    };
    const currentShared = {
      id: "result-shared",
      run_id: "run-shared",
      city_code: "320100",
      explanation_zh: "南京让大家都更从容",
      published_at: "2026-08-01T01:00:00.000Z",
    };
    const planLookup = mockPlanLookup(plan);
    const participantLookup = mockParticipantsLookup([]);
    const currentSharedLookup = mockCurrentSharedLookup(currentShared);
    const runLookup = mockRunProjectionLookup([sharedRun, newerPrivatePreview]);
    const pendingGroups = mockPendingGroups(0);
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: participantLookup.select })
      .mockReturnValueOnce({ select: currentSharedLookup.select })
      .mockReturnValueOnce({ select: runLookup.select })
      .mockReturnValueOnce({ select: pendingGroups.select });

    const { GET } = await import("@/app/api/plans/[code]/route");
    const response = await GET(new Request("http://localhost/api/plans/ABC123"), {
      params: Promise.resolve({ code: "ABC123" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latestRun).toEqual({
      runId: "run-shared",
      status: "completed",
      traceId: "11111111-1111-4111-8111-111111111111",
      pendingGroups: 0,
      retryAt: null,
      diagnosticCode: null,
      baseline: null,
    });
    expect(body.latestSharedResult).toEqual({
      id: "result-shared",
      city_code: "320100",
      explanation_zh: "南京让大家都更从容",
      published_at: "2026-08-01T01:00:00.000Z",
    });
    expect(body).not.toHaveProperty("kind");
    expect(JSON.stringify(body)).not.toContain("requested_by_participant_id");
    expect(JSON.stringify(body)).not.toContain("requested_city_code");
    expect(JSON.stringify(body)).not.toContain("alternative");
    expect(runLookup.eq).toHaveBeenCalledWith("id", "run-shared");
    expect(runLookup.eq).not.toHaveBeenCalledWith("plan_id", "plan-1");
    expect(runLookup.select).toHaveBeenCalledWith(
      "id, status, trace_id, retry_after, error_summary, started_at,baseline_city_code,baseline_city_name,baseline_policy_version,baseline_evidence_level,baseline_input_fingerprint",
    );
  });
});
