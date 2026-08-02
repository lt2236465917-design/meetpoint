import {
  calculationOutputSchema,
  POLICY_VERSION,
  type VerifiedQuote,
} from "../src/lib/agent/contracts";
import {
  createAgentModelForTransport,
} from "../src/lib/agent/deepseek-model";
import { compareDeepSeekTransports } from "../src/lib/agent/deepseek-transport-comparison";
import {
  buildCalculationSystemPrompt,
  buildSupervisorSystemPrompt,
  validateExplanationFacts,
} from "../src/lib/agent/prompts";
import { validateRecommendationPolicy } from "../src/lib/recommendation/validators";
import { getDeepSeekModel } from "../src/lib/ai/deepseek-client";
import { supervisorOutputSchema } from "../src/lib/agent/supervisor-agent";
import { z } from "zod";

const participantIds = [
  "00000000-0000-4000-8000-000000000101",
  "00000000-0000-4000-8000-000000000102",
] as const;
const arrivalDate = "2026-08-15";
const quote = (
  participantId: string,
  quoteId: string,
  priceCny: number,
  durationMinutes: number,
): VerifiedQuote => ({
  id: quoteId,
  quoteId,
  providerQuoteId: null,
  participantId,
  cityCode: "wuhan",
  mode: "high_speed_rail",
  searchDate: arrivalDate,
  queriedAt: "2026-08-01T00:00:00.000Z",
  priceCny,
  departAt: "2026-08-15T00:00:00.000+08:00",
  arriveAt: `2026-08-15T0${durationMinutes / 60}:00:00.000+08:00`,
  durationMinutes,
  transferCount: 0,
  isDirect: true,
  serviceName: "G100",
});
const cityInputs = [{
  cityCode: "wuhan",
  quotes: [
    quote(participantIds[0], "00000000-0000-4000-8000-000000000201", 200, 120),
    quote(participantIds[1], "00000000-0000-4000-8000-000000000202", 220, 180),
  ],
}];
const managerProbeSchema = z.object({ cityCode: z.literal("wuhan") }).strict();

const calculationInput = {
  policyVersion: POLICY_VERSION,
  arrivalDate,
  participantIds,
  correctionCodes: [],
  missingTaskIds: [],
  candidates: cityInputs.map((city) => ({
    cityCode: city.cityCode,
    quotes: city.quotes.map((item) => ({
      quoteId: item.quoteId,
      participantId: item.participantId,
      cityCode: item.cityCode,
      mode: item.mode,
      priceCny: item.priceCny,
      departAt: item.departAt,
      arriveAt: item.arriveAt,
      durationMinutes: item.durationMinutes,
      transferCount: item.transferCount,
      isDirect: item.isDirect,
      serviceName: item.serviceName,
    })),
  })),
};
async function main(): Promise<void> {
  const iterations = Number(process.env.DEEPSEEK_COMPARE_ITERATIONS || "1");
  if (!process.env.DEEPSEEK_API_KEY) {
    process.stdout.write(`${JSON.stringify({ status: "missing_credentials" })}\n`);
    return;
  }
  if (getDeepSeekModel() !== "deepseek-v4-flash") {
    process.stdout.write(`${JSON.stringify({ status: "unsupported_model" })}\n`);
    process.exitCode = 1;
    return;
  }

  const report = await compareDeepSeekTransports({
  iterations,
  createModel: (transport, observe) => {
    const model = createAgentModelForTransport(transport, observe);
    if (!model) throw new Error("MODEL_UNAVAILABLE");
    return model;
  },
  cases: [
    {
      name: "manager",
      request: {
        agent: "manager",
        system: "从允许的候选城市中返回唯一城市代码。",
        input: { allowedCityCodes: ["wuhan"] },
        outputSchema: managerProbeSchema,
        traceId: "00000000-0000-4000-8000-000000000300",
      },
      qualify: (value) => managerProbeSchema.safeParse(value).data?.cityCode === "wuhan",
    },
    {
      name: "calculation",
      request: {
        agent: "calculation",
        system: buildCalculationSystemPrompt({
          quoteIds: cityInputs.flatMap((city) => city.quotes.map((item) => item.quoteId)),
          policyVersion: POLICY_VERSION,
        }),
        input: calculationInput,
        outputSchema: calculationOutputSchema,
        traceId: "00000000-0000-4000-8000-000000000301",
      },
      qualify: (value) => {
        const output = calculationOutputSchema.safeParse(value);
        if (!output.success || output.data.status !== "proposal") return false;
        const policy = validateRecommendationPolicy({
          participantIds,
          arrivalDate,
          cityInputs,
          proposal: output.data,
        });
        const explanation = validateExplanationFacts(output.data.explanationZh, {
          quotes: cityInputs.flatMap((city) => city.quotes),
          cityCodes: cityInputs.map((city) => city.cityCode),
        });
        return policy.ok && explanation.ok;
      },
    },
    {
      name: "supervisor",
      request: {
        agent: "supervisor",
        system: buildSupervisorSystemPrompt({
          completeParticipantCount: participantIds.length,
          participantCount: participantIds.length,
          validationCodes: [],
          proposalVersion: 1,
          proposalId: "00000000-0000-4000-8000-000000000401",
        }),
        input: {
          proposalVersion: 1,
          proposalId: "00000000-0000-4000-8000-000000000401",
          coverage: {
            completeParticipantCount: participantIds.length,
            participantCount: participantIds.length,
          },
          deterministicValidation: { ok: true, codes: [] },
        },
        outputSchema: supervisorOutputSchema,
        traceId: "00000000-0000-4000-8000-000000000302",
      },
      qualify: (value) => supervisorOutputSchema.safeParse(value).data?.decision === "approve",
    },
  ],
  });

  process.stdout.write(`${JSON.stringify({ status: "ok", ...report })}\n`);
}

void main().catch(() => {
  process.stdout.write(`${JSON.stringify({ status: "comparison_failed" })}\n`);
  process.exitCode = 1;
});
