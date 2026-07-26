import { beforeEach, describe, expect, it } from "vitest";

import type { VerifiedQuote } from "@/lib/agent/contracts";
import {
  advanceFallbackRun,
  calculateFallbackRecommendations,
  confirmFallbackAlternative,
  createFallbackAlternativePreview,
  createFallbackParticipant,
  createFallbackPlan,
  readFallbackPlan,
  readFallbackPrivatePreview,
  resetFallbackStoreForTests,
  seedFallbackVerifiedQuotes,
  submitFallbackProposal,
  verifyFallbackParticipantCanCalculate,
} from "@/lib/fallback/mvp-store";

function quote(participantId: string, cityCode: string, suffix: "1" | "2"): VerifiedQuote {
  return {
    id: `quote-${participantId}-${cityCode}`,
    quoteId: `flyai:${"b".repeat(63)}${suffix}`,
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
  const created = await createFallbackPlan({ title: "发布守卫", arrivalDate: "2026-08-15", participantLimit: 2 });
  const first = await createFallbackParticipant(created.code, { name: "李雷", departureCityCode: "beijing", departureCityName: "北京", acceptedModes: ["flight"] });
  const second = await createFallbackParticipant(created.code, { name: "韩梅梅", departureCityCode: "shanghai", departureCityName: "上海", acceptedModes: ["flight"] });
  if (!first.ok || !second.ok) throw new Error("fixture setup failed");
  const verified = await verifyFallbackParticipantCanCalculate(created.code, first.editToken);
  if (!verified.ok) throw new Error("fixture authorization failed");
  return { created, first, second, planId: verified.planId };
}

async function completeAutomatic(input: Awaited<ReturnType<typeof setup>>) {
  const started = await calculateFallbackRecommendations(input.created.code);
  await advanceFallbackRun({ runId: started.runId, planId: input.planId });
  seedFallbackVerifiedQuotes(started.runId, [quote(input.first.participantId, "beijing", "1"), quote(input.second.participantId, "beijing", "2")]);
  await advanceFallbackRun({ runId: started.runId, planId: input.planId });
  await advanceFallbackRun({ runId: started.runId, planId: input.planId });
  await advanceFallbackRun({ runId: started.runId, planId: input.planId });
  return started.runId;
}

describe("fallback publication guard", () => {
  beforeEach(() => resetFallbackStoreForTests());

  it("requires a shared result before creating an alternative preview", async () => {
    const input = await setup();

    await expect(createFallbackAlternativePreview({
      code: input.created.code,
      participantToken: input.second.editToken,
      cityCode: "wuhan",
    })).rejects.toThrow("SHARED_RESULT_REQUIRED");
  });

  it("blocks a new automatic run after a shared result exists", async () => {
    const input = await setup();
    await completeAutomatic(input);

    await expect(calculateFallbackRecommendations(input.created.code))
      .rejects.toThrow("SHARED_RESULT_EXISTS");
  });

  it("resumes only the same participant and city preview", async () => {
    const input = await setup();
    await completeAutomatic(input);
    const preview = await createFallbackAlternativePreview({
      code: input.created.code,
      participantToken: input.second.editToken,
      cityCode: "wuhan",
    });

    await expect(createFallbackAlternativePreview({
      code: input.created.code,
      participantToken: input.second.editToken,
      cityCode: "wuhan",
    })).resolves.toEqual({
      disposition: "resume_existing",
      runId: preview.runId,
      status: "pending",
    });
    await expect(createFallbackAlternativePreview({
      code: input.created.code,
      participantToken: input.first.editToken,
      cityCode: "wuhan",
    })).rejects.toThrow("CALCULATION_IN_PROGRESS");
    await expect(createFallbackAlternativePreview({
      code: input.created.code,
      participantToken: input.second.editToken,
      cityCode: "nanjing",
    })).rejects.toThrow("CALCULATION_IN_PROGRESS");
  });

  it("ends missing real coverage as incomplete without exposing a shared result", async () => {
    const input = await setup();
    const started = await calculateFallbackRecommendations(input.created.code);
    await advanceFallbackRun({ runId: started.runId, planId: input.planId });
    seedFallbackVerifiedQuotes(started.runId, [quote(input.first.participantId, "beijing", "1")]);

    await expect(advanceFallbackRun({ runId: started.runId, planId: input.planId })).resolves.toMatchObject({
      status: "incomplete", diagnosticCode: "REAL_QUOTE_COVERAGE_INCOMPLETE",
    });
    expect(readFallbackPlan(input.created.code)?.latestSharedResult).toBeNull();
  });

  it("rejects an invalid proposal before materializing a shared result", async () => {
    const input = await setup();
    const started = await calculateFallbackRecommendations(input.created.code);
    await advanceFallbackRun({ runId: started.runId, planId: input.planId });
    seedFallbackVerifiedQuotes(started.runId, [quote(input.first.participantId, "beijing", "1"), quote(input.second.participantId, "beijing", "2")]);
    await advanceFallbackRun({ runId: started.runId, planId: input.planId });

    expect(submitFallbackProposal(started.runId, {
      status: "proposal", cityCode: "invented", schemes: [
        { kind: "saving", quoteIdsByParticipant: {}, totalFareCny: 0 },
        { kind: "fast", quoteIdsByParticipant: {}, totalFareCny: 0 },
      ],
      comparisonEvidence: { eligibleCityCodes: [], orderedCityCodes: [] }, explanationZh: "无依据说明。",
    })).toBeNull();
    expect(readFallbackPlan(input.created.code)?.latestRun).toMatchObject({ status: "failed", diagnosticCode: "AGENT_PROPOSAL_INVALID" });
    expect(readFallbackPlan(input.created.code)?.latestSharedResult).toBeNull();
  });

  it("keeps an alternative preview private until the host confirms its replacement", async () => {
    const input = await setup();
    await completeAutomatic(input);
    const preview = await createFallbackAlternativePreview({ code: input.created.code, participantToken: input.second.editToken, cityCode: "wuhan" });
    await advanceFallbackRun({ runId: preview.runId, planId: input.planId });
    seedFallbackVerifiedQuotes(preview.runId, [quote(input.first.participantId, "wuhan", "1"), quote(input.second.participantId, "wuhan", "2")]);
    await advanceFallbackRun({ runId: preview.runId, planId: input.planId });
    await advanceFallbackRun({ runId: preview.runId, planId: input.planId });
    await expect(advanceFallbackRun({ runId: preview.runId, planId: input.planId })).resolves.toMatchObject({ status: "awaiting_host_confirmation" });

    await expect(readFallbackPrivatePreview({ runId: preview.runId, participantToken: input.first.editToken })).resolves.toBeNull();
    await expect(readFallbackPrivatePreview({ runId: preview.runId, participantToken: input.second.editToken })).resolves.toMatchObject({ cityCode: "wuhan", isShared: false });
    expect(readFallbackPlan(input.created.code)?.latestSharedResult).toMatchObject({ cityCode: "beijing", isShared: true });

    await expect(confirmFallbackAlternative({ runId: preview.runId, hostToken: input.created.hostToken })).resolves.toMatchObject({ cityCode: "wuhan", isShared: true });
    expect(readFallbackPlan(input.created.code)?.latestSharedResult).toMatchObject({ cityCode: "wuhan", isShared: true });
  });

  it("rejects creating an alternative when there is no shared result to replace", async () => {
    const input = await setup();
    await expect(createFallbackAlternativePreview({ code: input.created.code, participantToken: input.second.editToken, cityCode: "wuhan" }))
      .rejects.toThrow("SHARED_RESULT_REQUIRED");
    expect(readFallbackPlan(input.created.code)?.latestSharedResult).toBeNull();
  });
});
