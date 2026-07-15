import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyToken } from "@/lib/security/tokens";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  planInsert: vi.fn(),
  planSingle: vi.fn(),
  credentialInsert: vi.fn(),
  deleteEq: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));

function mockPlanCreate(result = { data: { id: "plan-1" }, error: null }) {
  mocks.planSingle.mockResolvedValue(result);
  const select = vi.fn(() => ({ single: mocks.planSingle }));
  mocks.planInsert.mockReturnValue({ select });
  return { insert: mocks.planInsert, select };
}

describe("POST /api/plans", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.deleteEq.mockResolvedValue({ error: null });
  });

  it("rejects invalid and legacy plan input", async () => {
    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(new Request("http://localhost/api/plans", {
      method: "POST",
      body: JSON.stringify({
        title: "旧请求",
        meetingDate: "2026-08-15",
        targetArrivalTime: "18:00",
        participantLimit: 4,
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_INPUT" });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("creates an arrival-date plan and stores only the host-token hash", async () => {
    const planCreate = mockPlanCreate();
    mocks.credentialInsert.mockResolvedValue({ error: null });
    mocks.from
      .mockReturnValueOnce({ insert: planCreate.insert })
      .mockReturnValueOnce({ insert: mocks.credentialInsert });

    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(new Request("http://localhost/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "上海周末见面",
        arrivalDate: "2026-08-15",
        participantLimit: 4,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(json.hostToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(json.shareUrl).toBe(`/p/${json.code}`);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      "plans",
      "plan_credentials",
    ]);
    expect(mocks.planInsert).toHaveBeenCalledWith({
      code: json.code,
      title: "上海周末见面",
      meeting_date: "2026-08-15",
      participant_limit: 4,
      status: "collecting",
    });
    const credential = mocks.credentialInsert.mock.calls[0]?.[0];
    expect(credential).toMatchObject({ plan_id: "plan-1" });
    expect(credential).not.toHaveProperty("hostToken");
    expect(credential.host_token_hash).not.toBe(json.hostToken);
    await expect(verifyToken(json.hostToken, credential.host_token_hash)).resolves.toBe(true);
  });

  it("deletes the new plan when the credential write fails", async () => {
    const planCreate = mockPlanCreate();
    mocks.credentialInsert.mockResolvedValue({ error: { code: "DB_ERROR" } });
    const deletePlan = vi.fn(() => ({ eq: mocks.deleteEq }));
    mocks.from
      .mockReturnValueOnce({ insert: planCreate.insert })
      .mockReturnValueOnce({ insert: mocks.credentialInsert })
      .mockReturnValueOnce({ delete: deletePlan });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const { POST } = await import("@/app/api/plans/route");
      const response = await POST(new Request("http://localhost/api/plans", {
        method: "POST",
        body: JSON.stringify({
          title: "上海周末见面",
          arrivalDate: "2026-08-15",
          participantLimit: 4,
        }),
      }));

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "CREATE_PLAN_FAILED" });
      expect(mocks.deleteEq).toHaveBeenCalledWith("id", "plan-1");
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("returns a LAN share URL for localhost requests", async () => {
    const planCreate = mockPlanCreate();
    mocks.credentialInsert.mockResolvedValue({ error: null });
    mocks.from
      .mockReturnValueOnce({ insert: planCreate.insert })
      .mockReturnValueOnce({ insert: mocks.credentialInsert });
    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(new Request("http://localhost:3000/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "localhost:3000" },
      body: JSON.stringify({
        title: "上海周末见面",
        arrivalDate: "2026-08-15",
        participantLimit: 4,
      }),
    }));

    const json = await response.json();
    expect(json.shareUrl).toMatch(/^http:\/\/(?!localhost)(?!127\.0\.0\.1).+\/p\/[A-Z0-9]{6}$/);
  });
});
