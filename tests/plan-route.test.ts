import { describe, expect, it, vi, beforeEach } from "vitest";
import { verifyToken } from "@/lib/security/tokens";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  hasSupabaseEnvironment: () => true,
  createServiceSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

describe("POST /api/plans", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.insert.mockReset();
    mocks.from.mockReturnValue({ insert: mocks.insert });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("rejects invalid plan input", async () => {
    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(
      new Request("http://localhost/api/plans", {
        method: "POST",
        body: JSON.stringify({ title: "", participantLimit: 1 }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_INPUT" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates a plan and returns management details", async () => {
    const { POST } = await import("@/app/api/plans/route");
    const response = await POST(
      new Request("http://localhost/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "上海周末见面",
          meetingDate: "2026-08-15",
          targetArrivalTime: "18:00",
          participantLimit: 4,
        }),
      }),
    );

    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(json.manageToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(json.shareUrl).toBe(`/p/${json.code}`);
    expect(mocks.from).toHaveBeenCalledWith("plans");
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const inserted = mocks.insert.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({
      code: json.code,
      title: "上海周末见面",
      meeting_date: "2026-08-15",
      target_arrival_time: "18:00",
      participant_limit: 4,
      status: "collecting",
    });
    await expect(
      verifyToken(json.manageToken, inserted.management_token_hash),
    ).resolves.toBe(true);
  });
});
