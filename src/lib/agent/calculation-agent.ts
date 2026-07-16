import {
  calculationOutputSchema,
  POLICY_VERSION,
  type CalculationOutput,
  type ValidationDecision,
  type VerifiedQuote,
} from "@/lib/agent/contracts";
import type { AgentModel } from "@/lib/agent/model";
import {
  isTrustedAgentModel,
  recordAgentEvent,
  type AgentEventRecorder,
} from "@/lib/agent/trace";
import {
  buildCalculationSystemPrompt,
  validateExplanationFacts,
} from "@/lib/agent/prompts";
import {
  PolicyLimitExceededError,
  rankEligibleCities,
} from "@/lib/recommendation/policy";
import {
  validateRecommendationPolicy,
  type ValidateRecommendationPolicyInput,
} from "@/lib/recommendation/validators";
import type { AgentProposalRepository } from "@/lib/recommendation/repository";
import { deterministicAgentProposalId } from "@/lib/recommendation/repository";

export type CalculationSnapshot = {
  runId: string;
  traceId: string;
  proposalVersion: number;
  policyVersion: string;
  arrivalDate: string;
  participantIds: readonly string[];
  cityInputs: readonly {
    cityCode: string;
    quotes: readonly (VerifiedQuote & { source?: string })[];
  }[];
  missingTaskIds: readonly string[];
  correctionCodes?: readonly string[];
};

export type CalculationProposalStore = Pick<AgentProposalRepository, "saveProposal">;

type CalculationDependencies = CalculationProposalStore & {
  recordEvent?: AgentEventRecorder;
  validatePolicy?: (input: ValidateRecommendationPolicyInput) => ValidationDecision;
  validateExplanation?: (
    explanationZh: string,
    input: { quotes: readonly VerifiedQuote[]; cityCodes: readonly string[] },
  ) => ValidationDecision;
};

function combineDecisions(decisions: readonly ValidationDecision[]): ValidationDecision {
  const codes = decisions.flatMap((decision) => decision.ok ? [] : decision.codes);
  return codes.length === 0 ? { ok: true } : { ok: false, codes: [...new Set(codes)] };
}

function policyInput(snapshot: CalculationSnapshot, proposal: unknown): ValidateRecommendationPolicyInput {
  return {
    participantIds: snapshot.participantIds,
    arrivalDate: snapshot.arrivalDate,
    cityInputs: snapshot.cityInputs,
    proposal,
  };
}

function modelInput(snapshot: CalculationSnapshot): Record<string, unknown> {
  const missingTaskIds = [...snapshot.missingTaskIds];
  return {
    policyVersion: snapshot.policyVersion,
    arrivalDate: snapshot.arrivalDate,
    participantIds: snapshot.participantIds,
    correctionCodes: snapshot.correctionCodes ?? [],
    missingTaskIds,
    candidates: snapshot.cityInputs.map((city) => ({
      cityCode: city.cityCode,
      quotes: city.quotes.map((quote) => ({
        quoteId: quote.quoteId,
        participantId: quote.participantId,
        cityCode: quote.cityCode,
        mode: quote.mode,
        priceCny: quote.priceCny,
        departAt: quote.departAt,
        arriveAt: quote.arriveAt,
        durationMinutes: quote.durationMinutes,
        transferCount: quote.transferCount,
        isDirect: quote.isDirect,
        serviceName: quote.serviceName,
      })),
    })),
  };
}

function canonicalizeProposal(
  snapshot: CalculationSnapshot,
  output: CalculationOutput,
): CalculationOutput {
  if (output.status !== "proposal") return output;
  let ranked;
  try {
    ranked = rankEligibleCities(snapshot.cityInputs.map((city) => ({
      ...city,
      participantIds: snapshot.participantIds,
      arrivalDate: snapshot.arrivalDate,
    })));
  } catch (error) {
    if (error instanceof PolicyLimitExceededError) return output;
    throw error;
  }
  const winner = ranked[0];
  if (!winner || winner.cityCode !== output.cityCode) return output;
  return {
    status: "proposal",
    cityCode: winner.cityCode,
    schemes: [winner.savingScheme, winner.fastScheme],
    comparisonEvidence: {
      eligibleCityCodes: [...ranked.map((city) => city.cityCode)].sort(),
      orderedCityCodes: ranked.map((city) => city.cityCode),
    },
    explanationZh: output.explanationZh,
  };
}

export class CalculationAgent {
  private readonly validatePolicy: (input: ValidateRecommendationPolicyInput) => ValidationDecision;
  private readonly validateExplanation: NonNullable<CalculationDependencies["validateExplanation"]>;
  private readonly recordEvent: AgentEventRecorder;

  constructor(
    private readonly model: AgentModel,
    private readonly dependencies: CalculationDependencies,
  ) {
    this.validatePolicy = dependencies.validatePolicy ?? validateRecommendationPolicy;
    this.validateExplanation = dependencies.validateExplanation ?? validateExplanationFacts;
    this.recordEvent = dependencies.recordEvent ?? recordAgentEvent;
  }

  async propose(snapshot: CalculationSnapshot) {
    if (snapshot.policyVersion !== POLICY_VERSION) {
      throw new Error("Unsupported recommendation policy version");
    }
    await this.record("agent_started", "running", snapshot, {
      counts: {
        candidateCount: snapshot.cityInputs.length,
        quoteCount: snapshot.cityInputs.reduce((count, city) => count + city.quotes.length, 0),
      },
    });
    if (snapshot.missingTaskIds.length > 0) {
      await this.record("agent_completed", "completed", snapshot, {
        counts: { missingTaskCount: snapshot.missingTaskIds.length },
      });
      return calculationOutputSchema.parse({
        status: "incomplete",
        missingTaskIds: [...snapshot.missingTaskIds],
      });
    }

    let output: CalculationOutput;
    try {
      await this.recordModel("model_requested", "running", snapshot);
      output = calculationOutputSchema.parse(await this.model.generate({
        agent: "calculation",
        system: buildCalculationSystemPrompt({
          quoteIds: snapshot.cityInputs.flatMap((city) => city.quotes.map((quote) => quote.quoteId)),
          policyVersion: snapshot.policyVersion,
        }),
        input: modelInput(snapshot),
        outputSchema: calculationOutputSchema,
        traceId: snapshot.traceId,
      }));
      await this.recordModel("model_completed", "completed", snapshot);
    } catch (error) {
      await this.recordModel("model_failed", "invalid_output", snapshot);
      await this.record("agent_failed", "failed", snapshot);
      throw error;
    }
    output = canonicalizeProposal(snapshot, output);
    const decision: ValidationDecision = output.status === "proposal"
      ? combineDecisions([
        this.validatePolicy(policyInput(snapshot, output)),
        this.validateExplanation(output.explanationZh, {
          quotes: snapshot.cityInputs.flatMap((city) => city.quotes),
          cityCodes: snapshot.cityInputs.map((city) => city.cityCode),
        }),
      ])
      : { ok: false, codes: ["INVALID_PROPOSAL"] };
    const proposalId = deterministicAgentProposalId(snapshot.runId, snapshot.proposalVersion);
    try {
      await this.dependencies.saveProposal({
        proposalId,
        runId: snapshot.runId,
        version: snapshot.proposalVersion,
        policyVersion: snapshot.policyVersion,
        output,
        validationDecision: decision,
        status: decision.ok ? "pending" : "rejected",
      });
      await this.record("proposal_created", decision.ok ? "running" : "rejected", snapshot, { proposalId });
      await this.record("proposal_validated", decision.ok ? "completed" : "rejected", snapshot, {
        proposalId,
        validationCodes: decision.ok ? [] : decision.codes,
      });
      await this.record("agent_completed", decision.ok ? "completed" : "rejected", snapshot, { proposalId });
      return output;
    } catch (error) {
      await this.record("agent_failed", "failed", snapshot, { proposalId });
      throw error;
    }
  }

  private async record(
    eventType: "agent_started" | "agent_completed" | "agent_failed" | "proposal_created" | "proposal_validated",
    status: "running" | "completed" | "failed" | "rejected",
    snapshot: CalculationSnapshot,
    extra: Omit<Parameters<AgentEventRecorder>[0], "runId" | "traceId" | "agent" | "eventType" | "status"> = {},
  ): Promise<void> {
    await this.recordEvent({
      runId: snapshot.runId,
      traceId: snapshot.traceId,
      agent: "calculation",
      eventType,
      status,
      ...extra,
    });
  }

  private async recordModel(
    eventType: "model_requested" | "model_completed" | "model_failed",
    status: "running" | "completed" | "invalid_output",
    snapshot: CalculationSnapshot,
  ): Promise<void> {
    if (!isTrustedAgentModel(this.model.model)) return;
    await this.recordEvent({
      runId: snapshot.runId,
      traceId: snapshot.traceId,
      agent: "calculation",
      eventType,
      status,
      model: this.model.model,
    });
  }
}
