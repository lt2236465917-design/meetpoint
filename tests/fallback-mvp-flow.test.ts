import { beforeEach, describe, expect, it, vi } from "vitest";

describe("fallback MVP flow without Supabase environment variables", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  });

  it("creates a plan, accepts participants, calculates, regenerates explanations, and exposes labeled results", async () => {
    const { POST: createPlan } = await import("@/app/api/plans/route");
    const createResponse = await createPlan(
      new Request("http://localhost/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "上海周末见面",
          arrivalDate: "2026-08-15",
          participantLimit: 2,
        }),
      }),
    );
    const created = await createResponse.json();

    expect(createResponse.status).toBe(200);
    expect(created.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(created.hostToken).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(created.manageToken).toBeUndefined();

    const { POST: joinPlan } = await import(
      "@/app/api/plans/[code]/participants/route"
    );
    let participantToken = "";
    for (const participant of [
      {
        name: "李雷",
        departureCityCode: "beijing",
        departureCityName: "北京",
        acceptedModes: ["flight", "high_speed_rail"],
      },
      {
        name: "韩梅梅",
        departureCityCode: "shanghai",
        departureCityName: "上海",
        acceptedModes: ["high_speed_rail", "normal_train"],
      },
    ]) {
      const joinResponse = await joinPlan(
        new Request(
          `http://localhost/api/plans/${created.code}/participants`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(participant),
          },
        ),
        { params: Promise.resolve({ code: created.code }) },
      );

      expect(joinResponse.status).toBe(200);
      const joined = await joinResponse.json();
      expect(joined).toEqual({
        participantId: expect.any(String),
        editToken: expect.stringMatching(/^[A-Za-z0-9_-]{32,}$/),
      });
      participantToken ||= joined.editToken;
    }

    const { POST: calculate } = await import(
      "@/app/api/plans/[code]/calculate/route"
    );
    const calculateResponse = await calculate(
      new Request(`http://localhost/api/plans/${created.code}/calculate`, {
        method: "POST",
        headers: { "x-participant-token": participantToken },
      }),
      { params: Promise.resolve({ code: created.code }) },
    );
    const calculated = await calculateResponse.json();

    expect(calculateResponse.status).toBe(200);
    expect(calculated.runId).toEqual(expect.any(String));
    expect(calculated.candidateCount).toBeGreaterThan(0);

    const { POST: explain } = await import(
      "@/app/api/plans/[code]/explain/route"
    );
    const explainResponse = await explain(
      new Request(`http://localhost/api/plans/${created.code}/explain`, {
        method: "POST",
      }),
      { params: Promise.resolve({ code: created.code }) },
    );
    const explained = await explainResponse.json();

    expect(explainResponse.status).toBe(200);
    expect(explained).toEqual({
      ok: true,
      count: expect.any(Number),
    });
    expect(explained.count).toBeGreaterThan(0);

    const { GET: readPlan } = await import("@/app/api/plans/[code]/route");
    const readResponse = await readPlan(
      new Request(`http://localhost/api/plans/${created.code}`),
      { params: Promise.resolve({ code: created.code }) },
    );
    const read = await readResponse.json();

    expect(readResponse.status).toBe(200);
    expect(read.plan).toMatchObject({
      code: created.code,
      title: "上海周末见面",
      status: "completed",
    });
    expect(read.participants).toHaveLength(2);
    expect(read.latestRun).toMatchObject({
      id: calculated.runId,
      status: "completed",
      error_summary: "PARTIAL_ESTIMATE_FALLBACK",
    });

    const { readFallbackResult } = await import("@/lib/fallback/mvp-store");
    const result = readFallbackResult(created.code);
    expect(result?.recommendations.slice(0, 3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          labels: expect.arrayContaining(["balanced"]),
        }),
      ]),
    );
  });

  it("uses the last candidate city action when a city is excluded and then added again", async () => {
    const { POST: createPlan } = await import("@/app/api/plans/route");
    const createResponse = await createPlan(
      new Request("http://localhost/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "候选城市测试",
          arrivalDate: "2026-08-15",
          participantLimit: 4,
        }),
      }),
    );
    const created = await createResponse.json();

    const { POST: saveCandidate, GET: readCandidates } = await import(
      "@/app/api/plans/[code]/candidates/route"
    );

    const response = await saveCandidate(
      new Request(`http://localhost/api/plans/${created.code}/candidates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cityCode: "hangzhou",
          cityName: "杭州",
          enabled: true,
        }),
      }),
      { params: Promise.resolve({ code: created.code }) },
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      error: "CANDIDATE_EDITING_UNAVAILABLE",
    });

    const readResponse = await readCandidates(
      new Request(`http://localhost/api/plans/${created.code}/candidates`),
      { params: Promise.resolve({ code: created.code }) },
    );
    const read = await readResponse.json();

    expect(read.candidates).toEqual([]);
  });
});
