import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  advanceFallbackRun,
  calculateFallbackRecommendations,
  createFallbackParticipant,
  createFallbackPlan,
  readFallbackPlan,
  resetFallbackStoreForTests,
  seedFallbackVerifiedQuotes,
  verifyFallbackParticipantCanCalculate,
} from "@/lib/fallback/mvp-store";
import type { VerifiedQuote } from "@/lib/agent/contracts";

function quote(participantId: string, cityCode: string, suffix: "1" | "2"): VerifiedQuote {
  return {
    id: `quote-${participantId}-${cityCode}`,
    quoteId: `flyai:${"a".repeat(63)}${suffix}`,
    providerQuoteId: null,
    participantId,
    cityCode,
    mode: "flight",
    searchDate: "2026-08-15",
    queriedAt: "2026-08-01T00:00:00.000Z",
    priceCny: 100,
    departAt: "2026-08-15T08:00:00.000Z",
    arriveAt: "2026-08-15T10:00:00.000Z",
    durationMinutes: 120,
    transferCount: 0,
    isDirect: true,
    serviceName: "MU1000",
  };
}

async function setup() {
  const created = await createFallbackPlan({ title: "真实报价测试", arrivalDate: "2026-08-15", participantLimit: 2 });
  const first = await createFallbackParticipant(created.code, {
    name: "李雷", departureCityCode: "beijing", departureCityName: "北京", acceptedModes: ["flight"],
  });
  const second = await createFallbackParticipant(created.code, {
    name: "韩梅梅", departureCityCode: "shanghai", departureCityName: "上海", acceptedModes: ["flight"],
  });
  if (!first.ok || !second.ok) throw new Error("fallback fixture setup failed");
  const verified = await verifyFallbackParticipantCanCalculate(created.code, first.editToken);
  if (!verified.ok) throw new Error("fallback fixture authorization failed");
  return { created, first, second, planId: verified.planId };
}

describe("fallback real-evidence flow", () => {
  beforeEach(() => {
    vi.resetModules();
    resetFallbackStoreForTests();
  });

  it("creates pending work and publishes exactly one shared city only after real coverage completes", async () => {
    const { created, first, second, planId } = await setup();
    const started = await calculateFallbackRecommendations(created.code);
    expect(started.status).toBe("pending");
    await expect(advanceFallbackRun({ runId: started.runId, planId: "wrong-plan" })).rejects.toThrow("RUN_NOT_FOUND");

    const pending = readFallbackPlan(created.code);
    expect(pending?.latestSharedResult).toBeNull();
    const progress = await advanceFallbackRun({ runId: started.runId, planId });
    expect(progress.status).toBe("collecting");
    seedFallbackVerifiedQuotes(started.runId, [quote(first.participantId, "beijing", "1"), quote(second.participantId, "beijing", "2")]);
    await expect(advanceFallbackRun({ runId: started.runId, planId })).resolves.toMatchObject({ status: "calculating" });
    await expect(advanceFallbackRun({ runId: started.runId, planId })).resolves.toMatchObject({ status: "validating" });
    await expect(advanceFallbackRun({ runId: started.runId, planId })).resolves.toMatchObject({ status: "completed" });

    expect(readFallbackPlan(created.code)?.latestSharedResult).toMatchObject({ cityCode: "beijing", isShared: true });
  });
});
