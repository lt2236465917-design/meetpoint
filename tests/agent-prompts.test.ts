import { describe, expect, it } from "vitest";

import {
  buildCalculationSystemPrompt,
  buildSupervisorSystemPrompt,
  validateExplanationFacts,
} from "@/lib/agent/prompts";
import type { VerifiedQuote } from "@/lib/agent/contracts";

const quote: VerifiedQuote = {
  id: "row-1", quoteId: "q1", providerQuoteId: null, participantId: "p1", cityCode: "wuhan",
  mode: "high_speed_rail", searchDate: "2026-08-15", queriedAt: "2026-07-15T10:00:00+08:00",
  priceCny: 123, departAt: "2026-08-15T08:00:00+08:00", arriveAt: "2026-08-15T10:00:00+08:00",
  durationMinutes: 120, transferCount: 0, isDirect: true, serviceName: "G123",
};

describe("agent prompts", () => {
  it("makes Calculation authority and deterministic policy explicit without granting fact mutation or publication", () => {
    const prompt = buildCalculationSystemPrompt({ quoteIds: ["q1"], policyVersion: "2026-07-15.v1" });
    expect(prompt).toContain("q1");
    expect(prompt).toContain("direct-first");
    expect(prompt).toContain("110%");
    expect(prompt).toContain("130%");
    expect(prompt).toContain("incomplete");
    expect(prompt).toMatch(/不得.*(修改|发布)/);
  });

  it("makes Supervisor fail closed when deterministic validation is false", () => {
    const prompt = buildSupervisorSystemPrompt({ completeParticipantCount: 2, participantCount: 2, validationCodes: ["UNKNOWN_QUOTE_ID"] });
    expect(prompt).toContain("UNKNOWN_QUOTE_ID");
    expect(prompt).toMatch(/不得批准/);
  });

  it.each([
    ["supported structured facts", "G123 票价123元，行程120分钟。", true],
    ["unsupported currency", "票价999元。", false],
    ["unsupported service", "乘坐G999。", false],
    ["unsupported duration", "全程90分钟。", false],
    ["unsupported Chinese city", "北京路线已核验。", false],
  ])("%s", (_label, explanationZh, expected) => {
    expect(validateExplanationFacts(explanationZh, { quotes: [quote], cityCodes: ["wuhan"] }).ok).toBe(expected);
  });
});
