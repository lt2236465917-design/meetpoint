import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyToken } from "@/lib/security/tokens";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

describe("POST /api/plans", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rpc.mockReset();
  });

  it("rejects legacy plan input before calling storage", async () => {
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
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects a nonexistent calendar date before calling storage", async () => {
    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(new Request("http://localhost/api/plans", {
      method: "POST",
      body: JSON.stringify({
        title: "不存在的日期",
        arrivalDate: "2026-02-31",
        participantLimit: 4,
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_INPUT" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("atomically creates a plan and host credential through one RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: "plan-1", error: null });
    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(new Request("http://localhost/api/plans", {
      method: "POST",
      body: JSON.stringify({
        title: "上海周末见面",
        arrivalDate: "2026-08-15",
        participantLimit: 4,
      }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.hostToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_plan_with_host_credential",
      expect.objectContaining({
        p_code: json.code,
        p_title: "上海周末见面",
        p_meeting_date: "2026-08-15",
        p_participant_limit: 4,
      }),
    );
    const args = mocks.rpc.mock.calls[0]?.[1];
    expect(args).not.toHaveProperty("hostToken");
    await expect(verifyToken(json.hostToken, args.p_host_token_hash)).resolves.toBe(true);
  });

  it("returns a stable error without logging credentials when the RPC fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "db failure" } });
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
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
