import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken, verifyToken } from "@/lib/security/tokens";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  planSingle: vi.fn(),
  candidatesSelectEq: vi.fn(),
  deleteEq: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

function mockPlanLookup(
  plan: { id: string; management_token_hash: string } | null,
) {
  mocks.planSingle.mockResolvedValue({ data: plan });
  const single = vi.fn(() => mocks.planSingle());
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  return { select, eq, single };
}

function deleteCandidateBySource() {
  const sourceEq = vi.fn(() => mocks.deleteEq());
  const cityCodeEq = vi.fn(() => ({ eq: sourceEq }));
  const planIdEq = vi.fn(() => ({ eq: cityCodeEq }));
  const deleteFn = vi.fn(() => ({ eq: planIdEq }));
  return { delete: deleteFn, planIdEq, cityCodeEq, sourceEq };
}

function candidateMutation() {
  const oppositeDelete = deleteCandidateBySource();
  return {
    ...oppositeDelete,
    upsert: mocks.upsert,
  };
}

describe("management token verification primitive", () => {
  it("accepts the original token and rejects another token", async () => {
    const hash = await hashToken("manage-secret");
    await expect(verifyToken("manage-secret", hash)).resolves.toBe(true);
    await expect(verifyToken("other-secret", hash)).resolves.toBe(false);
  });
});

describe("verifyManagementTokenForPlan", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.planSingle.mockReset();
  });

  it("requires a management token before reading plan data", async () => {
    const { verifyManagementTokenForPlan } = await import(
      "@/lib/security/management-token"
    );

    await expect(
      verifyManagementTokenForPlan("ABC123", null),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      error: "MANAGEMENT_TOKEN_REQUIRED",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects missing plans and invalid management tokens", async () => {
    const missingPlanLookup = mockPlanLookup(null);
    mocks.from.mockReturnValueOnce({ select: missingPlanLookup.select });

    const { verifyManagementTokenForPlan } = await import(
      "@/lib/security/management-token"
    );

    await expect(
      verifyManagementTokenForPlan("UNKNOWN", "manage-secret"),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error: "PLAN_NOT_FOUND",
    });

    const invalidPlanLookup = mockPlanLookup({
      id: "plan-1",
      management_token_hash: await hashToken("manage-secret"),
    });
    mocks.from.mockReturnValueOnce({ select: invalidPlanLookup.select });

    await expect(
      verifyManagementTokenForPlan("ABC123", "wrong-secret"),
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "INVALID_MANAGEMENT_TOKEN",
    });
    expect(missingPlanLookup.eq).toHaveBeenCalledWith("code", "UNKNOWN");
    expect(invalidPlanLookup.eq).toHaveBeenCalledWith("code", "ABC123");
  });

  it("returns the plan id when the management token is valid", async () => {
    const planLookup = mockPlanLookup({
      id: "plan-1",
      management_token_hash: await hashToken("manage-secret"),
    });
    mocks.from.mockReturnValueOnce({ select: planLookup.select });

    const { verifyManagementTokenForPlan } = await import(
      "@/lib/security/management-token"
    );

    await expect(
      verifyManagementTokenForPlan("ABC123", "manage-secret"),
    ).resolves.toEqual({ ok: true, planId: "plan-1" });
    expect(planLookup.select).toHaveBeenCalledWith(
      "id, management_token_hash",
    );
  });
});

describe("POST /api/plans/[code]/candidates", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.planSingle.mockReset();
    mocks.candidatesSelectEq.mockReset();
    mocks.deleteEq.mockReset();
    mocks.upsert.mockReset();
  });

  it("requires a valid management token", async () => {
    const { POST } = await import("@/app/api/plans/[code]/candidates/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cityCode: "hangzhou",
          cityName: "杭州",
          enabled: true,
        }),
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "MANAGEMENT_TOKEN_REQUIRED",
    });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("deletes the opposite candidate action before upserting a verified host action", async () => {
    const planLookup = mockPlanLookup({
      id: "plan-1",
      management_token_hash: await hashToken("manage-secret"),
    });
    const mutation = candidateMutation();
    mocks.deleteEq.mockResolvedValue({ error: null });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce(mutation);

    const { POST } = await import("@/app/api/plans/[code]/candidates/route");
    const response = await POST(
      new Request("http://localhost/api/plans/ABC123/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-management-token": "manage-secret",
        },
        body: JSON.stringify({
          cityCode: "hangzhou",
          cityName: "杭州",
          enabled: false,
        }),
      }),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mutation.delete).toHaveBeenCalledWith();
    expect(mutation.planIdEq).toHaveBeenCalledWith("plan_id", "plan-1");
    expect(mutation.cityCodeEq).toHaveBeenCalledWith(
      "city_code",
      "hangzhou",
    );
    expect(mutation.sourceEq).toHaveBeenCalledWith(
      "source",
      "manual_add",
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      {
        plan_id: "plan-1",
        city_code: "hangzhou",
        city_name: "杭州",
        source: "manual_exclude",
        enabled: false,
      },
      { onConflict: "plan_id,city_code,source" },
    );
  });
});

describe("GET /api/plans/[code]/candidates", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.from.mockReset();
    mocks.planSingle.mockReset();
    mocks.candidatesSelectEq.mockReset();
    mocks.deleteEq.mockReset();
    mocks.upsert.mockReset();
  });

  it("returns candidate city controls for an existing plan", async () => {
    const planLookup = mockPlanLookup({
      id: "plan-1",
      management_token_hash: "unused",
    });
    mocks.candidatesSelectEq.mockResolvedValue({
      data: [
        {
          plan_id: "plan-1",
          city_code: "hangzhou",
          city_name: "杭州",
          source: "manual_add",
          enabled: true,
        },
      ],
    });
    const candidateSelect = vi.fn(() => ({ eq: mocks.candidatesSelectEq }));
    mocks.from
      .mockReturnValueOnce({ select: planLookup.select })
      .mockReturnValueOnce({ select: candidateSelect });

    const { GET } = await import("@/app/api/plans/[code]/candidates/route");
    const response = await GET(
      new Request("http://localhost/api/plans/ABC123/candidates"),
      { params: Promise.resolve({ code: "ABC123" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      candidates: [
        {
          plan_id: "plan-1",
          city_code: "hangzhou",
          city_name: "杭州",
          source: "manual_add",
          enabled: true,
        },
      ],
    });
    expect(candidateSelect).toHaveBeenCalledWith("*");
    expect(mocks.candidatesSelectEq).toHaveBeenCalledWith("plan_id", "plan-1");
  });
});
