import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyToken } from "@/lib/security/tokens";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}));

function request() {
  return new Request("http://localhost/api/plans/ABC123/participants", {
    method: "POST",
    body: JSON.stringify({
      name: "李雷",
      departureCityCode: "shanghai",
      departureCityName: "上海",
      acceptedModes: ["high_speed_rail", "flight"],
    }),
  });
}

describe("POST /api/plans/[code]/participants", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.rpc.mockReset();
  });

  it("atomically creates a participant and credential through one RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: "participant-1", error: null });
    const { POST } = await import("@/app/api/plans/[code]/participants/route");
    const response = await POST(request(), {
      params: Promise.resolve({ code: "ABC123" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.participantId).toBe("participant-1");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_participant_with_credential",
      expect.objectContaining({
        p_code: "ABC123",
        p_name: "李雷",
        p_departure_city_code: "shanghai",
        p_departure_city_name: "上海",
        p_accepted_modes: ["high_speed_rail", "flight"],
      }),
    );
    const args = mocks.rpc.mock.calls[0]?.[1];
    await expect(verifyToken(json.editToken, args.p_edit_token_hash)).resolves.toBe(true);
  });

  it.each([
    ["PLAN_NOT_FOUND", 404],
    ["PARTICIPANT_LIMIT_REACHED", 409],
  ])("maps %s from the RPC", async (message, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    const { POST } = await import("@/app/api/plans/[code]/participants/route");
    const response = await POST(request(), {
      params: Promise.resolve({ code: "ABC123" }),
    });

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: message });
  });

  it("returns a stable generic error for an unknown RPC failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "db failure" } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { POST } = await import("@/app/api/plans/[code]/participants/route");
      const response = await POST(request(), {
        params: Promise.resolve({ code: "ABC123" }),
      });
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: "CREATE_PARTICIPANT_FAILED" });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
