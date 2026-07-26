import { beforeEach, describe, expect, it } from "vitest";

import {
  calculateFallbackRecommendations,
  createFallbackParticipant,
  createFallbackPlan,
  readFallbackPlan,
  resetFallbackStoreForTests,
} from "@/lib/fallback/mvp-store";

describe("fallback calculation lock", () => {
  beforeEach(() => resetFallbackStoreForTests());

  it("resumes the pending automatic run", async () => {
    const created = await createFallbackPlan({ title: "运行互斥测试", arrivalDate: "2026-08-15", participantLimit: 2 });
    await createFallbackParticipant(created.code, { name: "李雷", departureCityCode: "beijing", departureCityName: "北京", acceptedModes: ["flight"] });
    await createFallbackParticipant(created.code, { name: "韩梅梅", departureCityCode: "shanghai", departureCityName: "上海", acceptedModes: ["flight"] });

    const first = await calculateFallbackRecommendations(created.code);
    await expect(calculateFallbackRecommendations(created.code)).resolves.toEqual({
      disposition: "resume_existing",
      runId: first.runId,
      status: "pending",
    });
    expect(readFallbackPlan(created.code)?.latestRun?.status).toBe("pending");
    expect(first).toMatchObject({ disposition: "created", status: "pending" });
  });
});
