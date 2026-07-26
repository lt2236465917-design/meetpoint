import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAlternativePreview: vi.fn(),
  readAlternativePreview: vi.fn(),
}));

vi.mock("@/lib/recommendation/alternative-preview", () => ({
  createAlternativePreview: mocks.createAlternativePreview,
  readAlternativePreview: mocks.readAlternativePreview,
}));

describe("alternative preview routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("lets a participant create a one-city preview with a canonical city pair", async () => {
    mocks.createAlternativePreview.mockResolvedValue({
      disposition: "created", runId: "run-1", status: "pending",
    });
    const { POST } = await import("@/app/api/plans/[code]/previews/route");

    const response = await POST(new Request("http://localhost/api/plans/ABC123/previews", {
      method: "POST",
      headers: { "content-type": "application/json", "x-participant-token": "participant-a" },
      body: JSON.stringify({ cityCode: "wuhan", cityName: "武汉" }),
    }), { params: Promise.resolve({ code: "ABC123" }) });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      disposition: "created", runId: "run-1", status: "pending",
    });
    expect(mocks.createAlternativePreview).toHaveBeenCalledWith({
      code: "ABC123", participantToken: "participant-a", cityCode: "wuhan", cityName: "武汉",
    });
  });

  it("returns 200 when the same participant resumes the same preview", async () => {
    mocks.createAlternativePreview.mockResolvedValue({
      disposition: "resume_existing", runId: "run-1", status: "collecting",
    });
    const { POST } = await import("@/app/api/plans/[code]/previews/route");
    const response = await POST(new Request("http://localhost/api/plans/ABC123/previews", {
      method: "POST",
      headers: { "content-type": "application/json", "x-participant-token": "participant-a" },
      body: JSON.stringify({ cityCode: "wuhan", cityName: "武汉" }),
    }), { params: Promise.resolve({ code: "ABC123" }) });

    expect(response.status).toBe(200);
  });

  it.each(["SHARED_RESULT_REQUIRED", "CALCULATION_IN_PROGRESS"])(
    "maps %s to a safe conflict",
    async (errorCode) => {
      mocks.createAlternativePreview.mockRejectedValue(new Error(errorCode));
      const { POST } = await import("@/app/api/plans/[code]/previews/route");
      const response = await POST(new Request("http://localhost/api/plans/ABC123/previews", {
        method: "POST",
        headers: { "content-type": "application/json", "x-participant-token": "participant-a" },
        body: JSON.stringify({ cityCode: "wuhan", cityName: "武汉" }),
      }), { params: Promise.resolve({ code: "ABC123" }) });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toEqual({ error: errorCode });
    },
  );

  it.each([
    { cityCode: "invented", cityName: "不存在" },
    { cityCode: "wuhan", cityName: "北京" },
  ])("rejects unsupported or mismatched city search input", async (body) => {
    const { POST } = await import("@/app/api/plans/[code]/previews/route");
    const response = await POST(new Request("http://localhost/api/plans/ABC123/previews", {
      method: "POST",
      headers: { "content-type": "application/json", "x-participant-token": "participant-a" },
      body: JSON.stringify(body),
    }), { params: Promise.resolve({ code: "ABC123" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "UNSUPPORTED_CITY" });
    expect(mocks.createAlternativePreview).not.toHaveBeenCalled();
  });

  it("returns 404 instead of revealing a preview to another participant", async () => {
    mocks.readAlternativePreview.mockResolvedValue(null);
    const { GET } = await import("@/app/api/plans/[code]/previews/[runId]/route");
    const response = await GET(new Request("http://localhost/api/plans/ABC123/previews/run-1", {
      headers: { "x-participant-token": "participant-b" },
    }), { params: Promise.resolve({ code: "ABC123", runId: "run-1" }) });

    expect(response.status).toBe(404);
    expect(mocks.readAlternativePreview).toHaveBeenCalledWith({
      code: "ABC123", runId: "run-1", participantToken: "participant-b", hostToken: null,
    });
  });
});
