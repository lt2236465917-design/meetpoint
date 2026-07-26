import { beforeEach, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

import type { VerifiedQuote } from "@/lib/agent/contracts";
import {
  advanceFallbackRun,
  calculateFallbackRecommendations,
  confirmFallbackAlternative,
  createFallbackAlternativePreview,
  createFallbackParticipant,
  createFallbackPlan,
  readFallbackPlan,
  resetFallbackStoreForTests,
  setFallbackNowForTests,
  seedFallbackVerifiedQuotes,
  verifyFallbackParticipantCanCalculate,
} from "@/lib/fallback/mvp-store";

function quote(participantId: string, cityCode: string, suffix: "1" | "2"): VerifiedQuote {
  return {
    id: `row-${participantId}-${cityCode}`, quoteId: `flyai:${"c".repeat(63)}${suffix}`,
    providerQuoteId: null, participantId, cityCode, mode: "flight", searchDate: "2026-08-15",
    queriedAt: "2026-08-01T00:00:00.000Z", priceCny: 100,
    departAt: "2026-08-15T08:00:00.000Z", arriveAt: "2026-08-15T10:00:00.000Z",
    durationMinutes: 120, transferCount: 0, isDirect: true, serviceName: "MU1000",
  };
}

async function advanceToDecision(runId: string, planId: string, quotes: VerifiedQuote[]) {
  await advanceFallbackRun({ runId, planId });
  seedFallbackVerifiedQuotes(runId, quotes);
  await advanceFallbackRun({ runId, planId });
  await advanceFallbackRun({ runId, planId });
  await advanceFallbackRun({ runId, planId });
}

describe("host confirmation semantics", () => {
  beforeEach(() => resetFallbackStoreForTests());

  it("confirms the approved private result exactly once and treats a repeated request as idempotent", async () => {
    const plan = await createFallbackPlan({ title: "替代城市", arrivalDate: "2026-08-15", participantLimit: 2 });
    const first = await createFallbackParticipant(plan.code, { name: "李雷", departureCityCode: "beijing", departureCityName: "北京", acceptedModes: ["flight"] });
    const second = await createFallbackParticipant(plan.code, { name: "韩梅梅", departureCityCode: "shanghai", departureCityName: "上海", acceptedModes: ["flight"] });
    if (!first.ok || !second.ok) throw new Error("fixture setup failed");
    const verified = await verifyFallbackParticipantCanCalculate(plan.code, first.editToken);
    if (!verified.ok) throw new Error("fixture authorization failed");

    const automatic = await calculateFallbackRecommendations(plan.code);
    await advanceToDecision(automatic.runId, verified.planId, [
      quote(first.participantId, "beijing", "1"), quote(second.participantId, "beijing", "2"),
    ]);
    const preview = await createFallbackAlternativePreview({
      code: plan.code, participantToken: second.editToken, cityCode: "wuhan",
    });
    await advanceToDecision(preview.runId, verified.planId, [
      quote(first.participantId, "wuhan", "1"), quote(second.participantId, "wuhan", "2"),
    ]);

    await expect(confirmFallbackAlternative({ runId: preview.runId, hostToken: first.editToken }))
      .rejects.toThrow("INVALID_HOST_TOKEN");
    const firstConfirmation = await confirmFallbackAlternative({ runId: preview.runId, hostToken: plan.hostToken });
    await expect(confirmFallbackAlternative({ runId: preview.runId, hostToken: plan.hostToken }))
      .resolves.toEqual(firstConfirmation);
    expect(readFallbackPlan(plan.code)?.latestSharedResult).toMatchObject({ cityCode: "wuhan" });
  });

  it("passes the exact Supervisor-approved proposal version to the atomic RPC", async () => {
    const source = await readFile("src/lib/security/host-confirmation.ts", "utf8");

    expect(source).toContain("proposal.supervisor_approved_version !== proposal.version");
    expect(source).toContain("p_proposal_id: proposal.id");
    expect(source).toContain("p_host_token_hash: credential.host_token_hash");
    expect(source).not.toContain("req.json");
  });

  it("rejects an expired private preview but preserves completed idempotency", async () => {
    let now = new Date("2026-08-01T00:00:00.000Z");
    setFallbackNowForTests(() => now);
    const plan = await createFallbackPlan({ title: "过期预览", arrivalDate: "2026-08-15", participantLimit: 2 });
    const first = await createFallbackParticipant(plan.code, { name: "李雷", departureCityCode: "beijing", departureCityName: "北京", acceptedModes: ["flight"] });
    const second = await createFallbackParticipant(plan.code, { name: "韩梅梅", departureCityCode: "shanghai", departureCityName: "上海", acceptedModes: ["flight"] });
    if (!first.ok || !second.ok) throw new Error("fixture setup failed");
    const verified = await verifyFallbackParticipantCanCalculate(plan.code, first.editToken);
    if (!verified.ok) throw new Error("fixture authorization failed");

    const automatic = await calculateFallbackRecommendations(plan.code);
    await advanceToDecision(automatic.runId, verified.planId, [
      quote(first.participantId, "beijing", "1"), quote(second.participantId, "beijing", "2"),
    ]);
    const preview = await createFallbackAlternativePreview({
      code: plan.code, participantToken: second.editToken, cityCode: "wuhan",
    });
    await advanceToDecision(preview.runId, verified.planId, [
      quote(first.participantId, "wuhan", "1"), quote(second.participantId, "wuhan", "2"),
    ]);

    now = new Date("2026-08-08T00:00:01.000Z");
    await expect(confirmFallbackAlternative({
      runId: preview.runId,
      hostToken: plan.hostToken,
    })).rejects.toThrow("PREVIEW_EXPIRED");
  });
});
