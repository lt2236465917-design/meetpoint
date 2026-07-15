import { describe, expect, it, vi } from "vitest";

import type { AgentModel } from "@/lib/agent/model";
import {
  CalculationAgent,
  type CalculationSnapshot,
} from "@/lib/agent/calculation-agent";
import type { RecommendationProposal, VerifiedQuote } from "@/lib/agent/contracts";

const runId = "00000000-0000-4000-8000-000000000001";
const traceId = "00000000-0000-4000-8000-000000000002";

function quote(
  quoteId: string,
  participantId: string,
  overrides: Partial<VerifiedQuote> = {},
): VerifiedQuote {
  return {
    id: `${participantId}-${quoteId}`,
    quoteId,
    providerQuoteId: null,
    participantId,
    cityCode: "wuhan",
    mode: "high_speed_rail",
    searchDate: "2026-08-15",
    queriedAt: "2026-07-15T10:00:00+08:00",
    priceCny: 100,
    departAt: "2026-08-15T08:00:00+08:00",
    arriveAt: "2026-08-15T10:00:00+08:00",
    durationMinutes: 120,
    transferCount: 0,
    isDirect: true,
    serviceName: "G1",
    ...overrides,
  };
}

const validProposal: RecommendationProposal = {
  status: "proposal",
  cityCode: "wuhan",
  schemes: [
    { kind: "saving", quoteIdsByParticipant: { p1: "p1-saving", p2: "p2-saving" }, totalFareCny: 200 },
    { kind: "fast", quoteIdsByParticipant: { p1: "p1-fast", p2: "p2-fast" }, totalFareCny: 240 },
  ],
  comparisonEvidence: { eligibleCityCodes: ["wuhan"], orderedCityCodes: ["wuhan"] },
  explanationZh: "已按真实票价核验武汉路线。",
};

function snapshot(overrides: Partial<CalculationSnapshot> = {}): CalculationSnapshot {
  return {
    runId,
    traceId,
    proposalVersion: 1,
    policyVersion: "2026-07-15.v1",
    arrivalDate: "2026-08-15",
    participantIds: ["p1", "p2"],
    cityInputs: [{
      cityCode: "wuhan",
      quotes: [
        quote("p1-saving", "p1", { durationMinutes: 180 }),
        quote("p1-fast", "p1", { priceCny: 120, durationMinutes: 60 }),
        quote("p2-saving", "p2", { durationMinutes: 180 }),
        quote("p2-fast", "p2", { priceCny: 120, durationMinutes: 60 }),
      ],
    }],
    missingTaskIds: [],
    ...overrides,
  };
}

function model(output: unknown): AgentModel {
  return {
    provider: "fake",
    model: "fake-model",
    generate: async ({ outputSchema }) => outputSchema.parse(output),
  };
}

describe("CalculationAgent", () => {
  it("validates arithmetic and evidence before persisting a proposal", async () => {
    const saveProposal = vi.fn(async () => undefined);
    const validatePolicy = vi.fn(() => ({ ok: true }) as const);
    const validateExplanation = vi.fn(() => ({ ok: true }) as const);
    const agent = new CalculationAgent(model(validProposal), {
      saveProposal,
      validatePolicy,
      validateExplanation,
    });

    await expect(agent.propose(snapshot())).resolves.toEqual(validProposal);
    expect(validatePolicy).toHaveBeenCalledBefore(saveProposal);
    expect(validateExplanation).toHaveBeenCalledBefore(saveProposal);
    expect(saveProposal).toHaveBeenCalledWith(expect.objectContaining({
      runId,
      version: 1,
      status: "pending",
      validationDecision: { ok: true },
    }));
  });

  it("returns deterministic incomplete output without asking the model to invent coverage", async () => {
    const generate = vi.fn();
    const agent = new CalculationAgent({ provider: "fake", model: "fake", generate }, {
      saveProposal: vi.fn(async () => undefined),
    });

    await expect(agent.propose(snapshot({ missingTaskIds: ["task-1"] }))).resolves.toEqual({
      status: "incomplete",
      missingTaskIds: ["task-1"],
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps validator-equivalent facts when only the Chinese explanation changes", async () => {
    const firstSave = vi.fn(async () => undefined);
    const secondSave = vi.fn(async () => undefined);
    const first = new CalculationAgent(model(validProposal), { saveProposal: firstSave });
    const second = new CalculationAgent(model({
      ...validProposal,
      explanationZh: "武汉的全员真实路线已通过核验。",
    }), { saveProposal: secondSave });

    await first.propose(snapshot());
    await second.propose(snapshot({ proposalVersion: 2 }));
    expect(firstSave.mock.calls[0]?.[0].output).toMatchObject({
      cityCode: secondSave.mock.calls[0]?.[0].output.cityCode,
      schemes: secondSave.mock.calls[0]?.[0].output.schemes,
      comparisonEvidence: secondSave.mock.calls[0]?.[0].output.comparisonEvidence,
    });
    expect(firstSave.mock.calls[0]?.[0].validationDecision).toEqual({ ok: true });
    expect(secondSave.mock.calls[0]?.[0].validationDecision).toEqual({ ok: true });
  });

  it.each([
    ["hidden estimate", snapshot({ cityInputs: [{ cityCode: "wuhan", quotes: snapshot().cityInputs[0]!.quotes.map((item, index) => index === 0 ? { ...item, source: "estimated" } : item) }] }), validProposal, "ESTIMATED_QUOTE"],
    ["wrong arrival date", snapshot({ cityInputs: [{ cityCode: "wuhan", quotes: snapshot().cityInputs[0]!.quotes.map((item, index) => index === 0 ? { ...item, arriveAt: "2026-08-15T23:30:00Z" } : item) }] }), validProposal, "ARRIVAL_DATE_MISMATCH"],
    ["invented quote ID", snapshot(), { ...validProposal, schemes: [{ ...validProposal.schemes[0], quoteIdsByParticipant: { p1: "invented", p2: "p2-saving" } }, validProposal.schemes[1]] }, "UNKNOWN_QUOTE_ID"],
    ["wrong fare total", snapshot(), { ...validProposal, schemes: [{ ...validProposal.schemes[0], totalFareCny: 201 }, validProposal.schemes[1]] }, "TOTAL_FARE_MISMATCH"],
  ])("persists rejected %s proposals for the Supervisor to correct", async (_label, input, output, code) => {
    const saveProposal = vi.fn(async () => undefined);
    const agent = new CalculationAgent(model(output), { saveProposal });

    await expect(agent.propose(input)).resolves.toEqual(output);
    expect(saveProposal).toHaveBeenCalledWith(expect.objectContaining({
      status: "rejected",
      validationDecision: expect.objectContaining({ codes: expect.arrayContaining([code]) }),
    }));
  });

  it.each([
    ["missing scheme", { ...validProposal, schemes: [validProposal.schemes[0]] }],
    ["reversed scheme order", { ...validProposal, schemes: [validProposal.schemes[1], validProposal.schemes[0]] }],
    ["second city field", { ...validProposal, secondCityCode: "beijing" }],
    ["hidden weight evidence", { ...validProposal, comparisonEvidence: { ...validProposal.comparisonEvidence, hiddenWeight: 0.7 } }],
  ])("fails closed on strict model output with %s", async (_label, output) => {
    await expect(new CalculationAgent(model(output), { saveProposal: vi.fn(async () => undefined) })
      .propose(snapshot())).rejects.toThrow();
  });
});
