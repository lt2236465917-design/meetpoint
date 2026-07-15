import {
  calculationOutputSchema,
  POLICY_VERSION,
  type ValidationDecision,
  type VerifiedQuote,
} from "@/lib/agent/contracts";
import type { AgentModel } from "@/lib/agent/model";
import {
  buildCalculationSystemPrompt,
  validateExplanationFacts,
} from "@/lib/agent/prompts";
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
  return {
    policyVersion: snapshot.policyVersion,
    arrivalDate: snapshot.arrivalDate,
    participantIds: snapshot.participantIds,
    correctionCodes: snapshot.correctionCodes ?? [],
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

export class CalculationAgent {
  private readonly validatePolicy: (input: ValidateRecommendationPolicyInput) => ValidationDecision;
  private readonly validateExplanation: NonNullable<CalculationDependencies["validateExplanation"]>;

  constructor(
    private readonly model: AgentModel,
    private readonly dependencies: CalculationDependencies,
  ) {
    this.validatePolicy = dependencies.validatePolicy ?? validateRecommendationPolicy;
    this.validateExplanation = dependencies.validateExplanation ?? validateExplanationFacts;
  }

  async propose(snapshot: CalculationSnapshot) {
    if (snapshot.policyVersion !== POLICY_VERSION) {
      throw new Error("Unsupported recommendation policy version");
    }
    if (snapshot.missingTaskIds.length > 0) {
      return calculationOutputSchema.parse({
        status: "incomplete",
        missingTaskIds: [...snapshot.missingTaskIds],
      });
    }

    const output = calculationOutputSchema.parse(await this.model.generate({
      agent: "calculation",
      system: buildCalculationSystemPrompt({
        quoteIds: snapshot.cityInputs.flatMap((city) => city.quotes.map((quote) => quote.quoteId)),
        policyVersion: snapshot.policyVersion,
      }),
      input: modelInput(snapshot),
      outputSchema: calculationOutputSchema,
      traceId: snapshot.traceId,
    }));
    if (output.status === "incomplete") return output;

    const decision = combineDecisions([
      this.validatePolicy(policyInput(snapshot, output)),
      this.validateExplanation(output.explanationZh, {
        quotes: snapshot.cityInputs.flatMap((city) => city.quotes),
        cityCodes: snapshot.cityInputs.map((city) => city.cityCode),
      }),
    ]);
    await this.dependencies.saveProposal({
      proposalId: deterministicAgentProposalId(snapshot.runId, snapshot.proposalVersion),
      runId: snapshot.runId,
      version: snapshot.proposalVersion,
      policyVersion: snapshot.policyVersion,
      output,
      validationDecision: decision,
      status: decision.ok ? "pending" : "rejected",
    });
    return output;
  }
}
