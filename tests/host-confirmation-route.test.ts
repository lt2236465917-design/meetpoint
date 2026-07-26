import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ confirmAlternativePreview: vi.fn() }));

vi.mock("@/lib/security/host-confirmation", () => ({
  confirmAlternativePreview: mocks.confirmAlternativePreview,
}));

describe("POST /api/plans/[code]/previews/[runId]/confirm", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not accept participant authority or a body role in place of x-host-token", async () => {
    const { POST } = await import("@/app/api/plans/[code]/previews/[runId]/confirm/route");
    const response = await POST(new Request("http://localhost/api/plans/ABC123/previews/run-1/confirm", {
      method: "POST",
      headers: { "content-type": "application/json", "x-participant-token": "participant-a" },
      body: JSON.stringify({ role: "host", hostToken: "body-token" }),
    }), { params: Promise.resolve({ code: "ABC123", runId: "run-1" }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "HOST_TOKEN_REQUIRED" });
    expect(mocks.confirmAlternativePreview).not.toHaveBeenCalled();
  });

  it("confirms through the host-only boundary", async () => {
    mocks.confirmAlternativePreview.mockResolvedValue({ runId: "run-1", status: "completed" });
    const { POST } = await import("@/app/api/plans/[code]/previews/[runId]/confirm/route");
    const response = await POST(new Request("http://localhost/api/plans/ABC123/previews/run-1/confirm", {
      method: "POST", headers: { "x-host-token": "host-token" },
    }), { params: Promise.resolve({ code: "ABC123", runId: "run-1" }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ runId: "run-1", status: "completed" });
    expect(mocks.confirmAlternativePreview).toHaveBeenCalledWith({
      code: "ABC123", runId: "run-1", hostToken: "host-token",
    });
  });

  it("maps an expired preview to a safe conflict", async () => {
    mocks.confirmAlternativePreview.mockRejectedValue(new Error("PREVIEW_EXPIRED"));
    const { POST } = await import("@/app/api/plans/[code]/previews/[runId]/confirm/route");
    const response = await POST(new Request("http://localhost/api/plans/ABC123/previews/run-1/confirm", {
      method: "POST", headers: { "x-host-token": "host-token" },
    }), { params: Promise.resolve({ code: "ABC123", runId: "run-1" }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "PREVIEW_EXPIRED" });
  });
});
