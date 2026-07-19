import { describe, expect, it, vi } from "vitest";

import { CalculationAgent, type CalculationSnapshot } from "@/lib/agent/calculation-agent";
import type { AgentModel } from "@/lib/agent/model";
import { runProposalReviewLoop, SupervisorAgent } from "@/lib/agent/supervisor-agent";
import type { RecommendationProposal, VerifiedQuote } from "@/lib/agent/contracts";

vi.mock("@/lib/agent/trace", () => ({
  isTrustedAgentModel: (value: string) => value === "deepseek-v4-flash",
  recordAgentEvent: vi.fn(async () => undefined),
}));

const runId = "00000000-0000-4000-8000-000000000101";
const traceId = "00000000-0000-4000-8000-000000000102";

function quote(quoteId: string, participantId: string, overrides: Partial<VerifiedQuote> = {}): VerifiedQuote {
  return {
    id: quoteId, quoteId, providerQuoteId: null, participantId, cityCode: "wuhan", mode: "high_speed_rail",
    searchDate: "2026-08-15", queriedAt: "2026-07-15T10:00:00+08:00", priceCny: 100,
    departAt: "2026-08-15T08:00:00+08:00", arriveAt: "2026-08-15T10:00:00+08:00",
    durationMinutes: 120, transferCount: 0, isDirect: true, serviceName: "G1", ...overrides,
  };
}

const proposal: RecommendationProposal = {
  status: "proposal", cityCode: "wuhan",
  schemes: [
    { kind: "saving", quoteIdsByParticipant: { p1: "p1-saving", p2: "p2-saving" }, totalFareCny: 200 },
    { kind: "fast", quoteIdsByParticipant: { p1: "p1-fast", p2: "p2-fast" }, totalFareCny: 240 },
  ],
  comparisonEvidence: { eligibleCityCodes: ["wuhan"], orderedCityCodes: ["wuhan"] },
  explanationZh: "这座城市按真实票价和统一规则为全员选出，每一程都有据可查。",
};

const snapshot: CalculationSnapshot = {
  runId, traceId, proposalVersion: 1, policyVersion: "2026-07-19.v2", arrivalDate: "2026-08-15",
  participantIds: ["p1", "p2"], missingTaskIds: [],
  cityInputs: [{ cityCode: "wuhan", quotes: [
    quote("p1-saving", "p1", { durationMinutes: 180 }), quote("p1-fast", "p1", { priceCny: 120, durationMinutes: 60 }),
    quote("p2-saving", "p2", { durationMinutes: 180 }), quote("p2-fast", "p2", { priceCny: 120, durationMinutes: 60 }),
  ] }],
};

function model(output: unknown): AgentModel {
  return { provider: "fake", model: "fake", generate: async ({ outputSchema }) => outputSchema.parse(output) };
}

describe("SupervisorAgent", () => {
  it("approves only a proposal which independently passes deterministic validation", async () => {
    const reviewProposal = vi.fn(async () => undefined);
    const supervisor = new SupervisorAgent(model({ decision: "approve" }), { reviewProposal });

    await expect(supervisor.review(snapshot, proposal)).resolves.toEqual({ decision: "approve" });
    expect(reviewProposal).toHaveBeenCalledWith(expect.objectContaining({ approved: true, codes: [] }));
  });

  it("records allowlisted supervisor model, validation, and review events", async () => {
    const recordEvent = vi.fn(async () => undefined);
    const trustedModel: AgentModel = {
      provider: "fake",
      model: "deepseek-v4-flash",
      generate: async ({ outputSchema }) => outputSchema.parse({ decision: "approve" }),
    };
    const supervisor = new SupervisorAgent(trustedModel, {
      reviewProposal: vi.fn(async () => undefined),
      recordEvent,
    } as never);

    await supervisor.review(snapshot, proposal);

    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      agent: "supervisor",
      eventType: "model_requested",
      model: "deepseek-v4-flash",
    }));
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      agent: "supervisor",
      eventType: "validation_finished",
      status: "approved",
      validationCodes: [],
    }));
    expect(JSON.stringify(recordEvent.mock.calls)).not.toMatch(/system|prompt|input|participant/i);
  });

  it("rejects a proposal while route coverage remains incomplete", async () => {
    const supervisor = new SupervisorAgent(model({ decision: "approve" }), {
      reviewProposal: vi.fn(async () => undefined),
    });

    await expect(supervisor.review({ ...snapshot, missingTaskIds: ["task-1"] }, proposal)).resolves.toEqual({
      decision: "correct", codes: ["MISSING_COVERAGE"],
    });
  });

  it.each([
    ["estimated quote", { ...snapshot, cityInputs: [{ cityCode: "wuhan", quotes: snapshot.cityInputs[0]!.quotes.map((item, index) => index === 0 ? { ...item, source: "estimated" } : item) }] }, proposal, "ESTIMATED_QUOTE"],
    ["wrong date", { ...snapshot, cityInputs: [{ cityCode: "wuhan", quotes: snapshot.cityInputs[0]!.quotes.map((item, index) => index === 0 ? { ...item, arriveAt: "2026-08-15T23:30:00Z" } : item) }] }, proposal, "ARRIVAL_DATE_MISMATCH"],
    ["invented ID", snapshot, { ...proposal, schemes: [{ ...proposal.schemes[0], quoteIdsByParticipant: { p1: "unknown", p2: "p2-saving" } }, proposal.schemes[1]] }, "UNKNOWN_QUOTE_ID"],
    ["wrong total", snapshot, { ...proposal, schemes: [{ ...proposal.schemes[0], totalFareCny: 201 }, proposal.schemes[1]] }, "TOTAL_FARE_MISMATCH"],
    ["extra city evidence", snapshot, { ...proposal, comparisonEvidence: { eligibleCityCodes: ["wuhan", "beijing"], orderedCityCodes: ["wuhan", "beijing"] } }, "INVALID_CITY_EVIDENCE"],
    ["missing scheme", snapshot, { ...proposal, schemes: [proposal.schemes[0]] }, "INVALID_SCHEMES"],
    ["reversed scheme order", snapshot, { ...proposal, schemes: [proposal.schemes[1], proposal.schemes[0]] }, "INVALID_SCHEMES"],
    ["second city", snapshot, { ...proposal, secondCityCode: "beijing" }, "INVALID_PROPOSAL"],
    ["hidden weight evidence", snapshot, { ...proposal, comparisonEvidence: { ...proposal.comparisonEvidence, hiddenWeight: 1 } }, "INVALID_PROPOSAL"],
  ])("rejects %s even when the model tries to approve it", async (_label, input, output, code) => {
    const supervisor = new SupervisorAgent(model({ decision: "approve" }), { reviewProposal: vi.fn(async () => undefined) });
    const decision = await supervisor.review(input, output);

    expect(decision).toEqual(expect.objectContaining({ decision: "correct", codes: expect.arrayContaining([code]) }));
  });

  it("uses only bounded correction codes when a valid proposal needs revision", async () => {
    const supervisor = new SupervisorAgent(model({ decision: "correct", codes: ["EXPLANATION_UNSUPPORTED_FACT"] }), {
      reviewProposal: vi.fn(async () => undefined),
    });
    await expect(supervisor.review(snapshot, proposal)).resolves.toEqual({
      decision: "correct", codes: ["EXPLANATION_UNSUPPORTED_FACT"],
    });
  });

  it("rejects an unknown model correction code before it is persisted or forwarded", async () => {
    const reviewProposal = vi.fn(async () => undefined);
    const supervisor = new SupervisorAgent(model({
      decision: "correct",
      codes: ["SOMETHING_ELSE"],
    }), { reviewProposal });

    await expect(supervisor.review(snapshot, proposal)).rejects.toThrow();
    expect(reviewProposal).not.toHaveBeenCalled();
  });

  it("reviews and fails twice when complete coverage receives an invented incomplete output", async () => {
    const saveProposal = vi.fn(async () => undefined);
    const reviewProposal = vi.fn(async () => undefined);
    const markRunFailed = vi.fn(async () => undefined);
    const calculation = new CalculationAgent(model({
      status: "incomplete",
      missingTaskIds: ["invented-missing-task"],
    }), { saveProposal });
    const supervisor = new SupervisorAgent(model({ decision: "approve" }), { reviewProposal });
    const review = vi.spyOn(supervisor, "review");

    await expect(runProposalReviewLoop({ calculation, supervisor, snapshot, markRunFailed })).resolves.toEqual({
      decision: "correct",
      codes: ["INVALID_PROPOSAL"],
    });
    expect(saveProposal).toHaveBeenCalledTimes(2);
    expect(review).toHaveBeenCalledTimes(2);
    expect(reviewProposal).not.toHaveBeenCalled();
    expect(markRunFailed).toHaveBeenCalledWith(runId, "AGENT_PROPOSAL_INVALID");
  });

  it("stops after two rejected proposal attempts with the public invalid-proposal code", async () => {
    const saveProposal = vi.fn(async () => undefined);
    const reviewProposal = vi.fn(async () => undefined);
    const markRunFailed = vi.fn(async () => undefined);
    const calculation = new CalculationAgent(model({
      ...proposal,
      cityCode: "beijing",
      comparisonEvidence: { eligibleCityCodes: ["beijing"], orderedCityCodes: ["beijing"] },
    }), { saveProposal });
    const supervisor = new SupervisorAgent(model({ decision: "approve" }), { reviewProposal });

    await expect(runProposalReviewLoop({ calculation, supervisor, snapshot, markRunFailed })).resolves.toEqual({
      decision: "correct", codes: expect.arrayContaining(["INVALID_CITY_EVIDENCE"]),
    });
    expect(saveProposal).toHaveBeenCalledTimes(2);
    expect(reviewProposal).not.toHaveBeenCalled();
    expect(markRunFailed).toHaveBeenCalledWith(runId, "AGENT_PROPOSAL_INVALID");
  });
});
