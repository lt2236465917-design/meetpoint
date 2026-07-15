import { z } from "zod";

import {
  calculationOutputSchema,
  type RecommendationProposal,
  type ValidationDecision,
  type VerifiedQuote,
} from "@/lib/agent/contracts";
import type { AgentModel } from "@/lib/agent/model";
import type { CalculationAgent, CalculationSnapshot } from "@/lib/agent/calculation-agent";
import { buildSupervisorSystemPrompt, validateExplanationFacts } from "@/lib/agent/prompts";
import {
  validateRecommendationPolicy,
  type ValidateRecommendationPolicyInput,
} from "@/lib/recommendation/validators";
import type { AgentProposalRepository } from "@/lib/recommendation/repository";
import { deterministicAgentProposalId } from "@/lib/recommendation/repository";

const correctionCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const supervisorOutputSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }).strict(),
  z.object({ decision: z.literal("correct"), codes: z.array(correctionCodeSchema).min(1).max(8) }).strict(),
]);

export type SupervisorDecision =
  | { decision: "approve" }
  | { decision: "correct"; codes: string[] };

export type SupervisorProposalStore = Pick<AgentProposalRepository, "reviewProposal">;

type SupervisorDependencies = SupervisorProposalStore & {
  validatePolicy?: (input: ValidateRecommendationPolicyInput) => ValidationDecision;
  validateExplanation?: (
    explanationZh: string,
    input: { quotes: readonly VerifiedQuote[]; cityCodes: readonly string[] },
  ) => ValidationDecision;
};

function validationInput(
  snapshot: CalculationSnapshot,
  proposal: unknown,
): ValidateRecommendationPolicyInput {
  return {
    participantIds: snapshot.participantIds,
    arrivalDate: snapshot.arrivalDate,
    cityInputs: snapshot.cityInputs,
    proposal,
  };
}

function deterministicDecision(
  snapshot: CalculationSnapshot,
  proposal: RecommendationProposal,
  validatePolicy: (input: ValidateRecommendationPolicyInput) => ValidationDecision,
  validateExplanation: SupervisorDependencies["validateExplanation"],
): ValidationDecision {
  const decisions = [
    validatePolicy(validationInput(snapshot, proposal)),
    validateExplanation!(proposal.explanationZh, {
      quotes: snapshot.cityInputs.flatMap((city) => city.quotes),
      cityCodes: snapshot.cityInputs.map((city) => city.cityCode),
    }),
  ];
  const codes = decisions.flatMap((decision) => decision.ok ? [] : decision.codes);
  return codes.length === 0 ? { ok: true } : { ok: false, codes: [...new Set(codes)] };
}

export class SupervisorAgent {
  private readonly validatePolicy: (input: ValidateRecommendationPolicyInput) => ValidationDecision;
  private readonly validateExplanation: NonNullable<SupervisorDependencies["validateExplanation"]>;

  constructor(
    private readonly model: AgentModel,
    private readonly dependencies: SupervisorDependencies,
  ) {
    this.validatePolicy = dependencies.validatePolicy ?? validateRecommendationPolicy;
    this.validateExplanation = dependencies.validateExplanation ?? validateExplanationFacts;
  }

  async review(
    snapshot: CalculationSnapshot,
    proposal: unknown,
  ): Promise<SupervisorDecision> {
    if (snapshot.missingTaskIds.length > 0) {
      const decision: SupervisorDecision = { decision: "correct", codes: ["MISSING_COVERAGE"] };
      await this.persist(snapshot, decision);
      return decision;
    }
    const parsed = calculationOutputSchema.safeParse(proposal);
    if (!parsed.success || parsed.data.status !== "proposal") {
      const deterministic = this.validatePolicy(validationInput(snapshot, proposal));
      const decision: SupervisorDecision = {
        decision: "correct",
        codes: deterministic.ok ? ["INVALID_PROPOSAL"] : deterministic.codes,
      };
      await this.persist(snapshot, decision);
      return decision;
    }
    const deterministic = deterministicDecision(
      snapshot,
      parsed.data,
      this.validatePolicy,
      this.validateExplanation,
    );
    if (!deterministic.ok) {
      const decision: SupervisorDecision = { decision: "correct", codes: deterministic.codes };
      await this.persist(snapshot, decision);
      return decision;
    }

    const modelDecision = await this.model.generate({
      agent: "supervisor",
      system: buildSupervisorSystemPrompt({
        completeParticipantCount: snapshot.participantIds.length,
        participantCount: snapshot.participantIds.length,
        validationCodes: [],
        proposalVersion: snapshot.proposalVersion,
        proposalId: deterministicAgentProposalId(snapshot.runId, snapshot.proposalVersion),
      }),
      input: {
        proposalVersion: snapshot.proposalVersion,
        proposalId: deterministicAgentProposalId(snapshot.runId, snapshot.proposalVersion),
        coverage: { completeParticipantCount: snapshot.participantIds.length, participantCount: snapshot.participantIds.length },
        deterministicValidation: { ok: true, codes: [] },
      },
      outputSchema: supervisorOutputSchema,
      traceId: snapshot.traceId,
    });
    const decision: SupervisorDecision = modelDecision.decision === "approve"
      ? { decision: "approve" }
      : { decision: "correct", codes: modelDecision.codes };
    await this.persist(snapshot, decision);
    return decision;
  }

  private async persist(snapshot: CalculationSnapshot, decision: SupervisorDecision): Promise<void> {
    await this.dependencies.reviewProposal({
      runId: snapshot.runId,
      version: snapshot.proposalVersion,
      approved: decision.decision === "approve",
      codes: decision.decision === "approve" ? [] : decision.codes,
    });
  }
}

export async function runProposalReviewLoop(input: {
  calculation: CalculationAgent;
  supervisor: SupervisorAgent;
  snapshot: CalculationSnapshot;
  markRunFailed(runId: string, code: "AGENT_PROPOSAL_INVALID"): Promise<void>;
}): Promise<SupervisorDecision> {
  let lastDecision: SupervisorDecision = { decision: "correct", codes: ["AGENT_PROPOSAL_INVALID"] };
  let correctionCodes: readonly string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptSnapshot: CalculationSnapshot = {
      ...input.snapshot,
      proposalVersion: input.snapshot.proposalVersion + attempt,
      correctionCodes,
    };
    const output = await input.calculation.propose(attemptSnapshot);
    if (output.status === "incomplete") {
      return { decision: "correct", codes: ["MISSING_COVERAGE"] };
    }
    lastDecision = await input.supervisor.review(attemptSnapshot, output);
    if (lastDecision.decision === "approve") return lastDecision;
    correctionCodes = lastDecision.codes;
  }
  await input.markRunFailed(input.snapshot.runId, "AGENT_PROPOSAL_INVALID");
  return lastDecision;
}
