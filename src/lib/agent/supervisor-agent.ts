import { z } from "zod";

import {
  calculationOutputSchema,
  CORRECTION_CODES,
  isCorrectionCode,
  type CorrectionCode,
  type RecommendationProposal,
  type ValidationDecision,
  type VerifiedQuote,
} from "@/lib/agent/contracts";
import type { AgentModel } from "@/lib/agent/model";
import {
  isTrustedAgentModel,
  recordAgentEvent,
  type AgentEventRecorder,
} from "@/lib/agent/trace";
import type { CalculationAgent, CalculationSnapshot } from "@/lib/agent/calculation-agent";
import { buildSupervisorSystemPrompt, validateExplanationFacts } from "@/lib/agent/prompts";
import {
  validateRecommendationPolicy,
  type ValidateRecommendationPolicyInput,
} from "@/lib/recommendation/validators";
import type { AgentProposalRepository } from "@/lib/recommendation/repository";
import { deterministicAgentProposalId } from "@/lib/recommendation/repository";

const correctionCodeSchema = z.enum(CORRECTION_CODES);
export const supervisorOutputSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }).strict(),
  z.object({ decision: z.literal("correct"), codes: z.array(correctionCodeSchema).min(1).max(8) }).strict(),
]);

export type SupervisorDecision =
  | { decision: "approve" }
  | { decision: "correct"; codes: CorrectionCode[] };

export type SupervisorProposalStore = Pick<AgentProposalRepository, "reviewProposal">;

type SupervisorDependencies = SupervisorProposalStore & {
  recordEvent?: AgentEventRecorder;
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

function correctionDecision(codes: readonly unknown[]): SupervisorDecision {
  const boundedCodes = [...new Set(codes.filter(isCorrectionCode))];
  return {
    decision: "correct",
    codes: boundedCodes.length > 0 ? boundedCodes : ["INVALID_PROPOSAL"],
  };
}

export class SupervisorAgent {
  private readonly validatePolicy: (input: ValidateRecommendationPolicyInput) => ValidationDecision;
  private readonly validateExplanation: NonNullable<SupervisorDependencies["validateExplanation"]>;
  private readonly recordEvent: AgentEventRecorder;

  constructor(
    private readonly model: AgentModel,
    private readonly dependencies: SupervisorDependencies,
  ) {
    this.validatePolicy = dependencies.validatePolicy ?? validateRecommendationPolicy;
    this.validateExplanation = dependencies.validateExplanation ?? validateExplanationFacts;
    this.recordEvent = dependencies.recordEvent ?? recordAgentEvent;
  }

  async review(
    snapshot: CalculationSnapshot,
    proposal: unknown,
  ): Promise<SupervisorDecision> {
    await this.record("agent_started", "running", snapshot);
    if (snapshot.missingTaskIds.length > 0) {
      const decision: SupervisorDecision = { decision: "correct", codes: ["MISSING_COVERAGE"] };
      await this.recordDecision(snapshot, decision);
      return decision;
    }
    const parsed = calculationOutputSchema.safeParse(proposal);
    if (!parsed.success) {
      const deterministic = this.validatePolicy(validationInput(snapshot, proposal));
      const decision = correctionDecision(deterministic.ok ? ["INVALID_PROPOSAL"] : deterministic.codes);
      await this.recordDecision(snapshot, decision);
      return decision;
    }
    if (parsed.data.status === "incomplete") {
      const decision: SupervisorDecision = { decision: "correct", codes: ["INVALID_PROPOSAL"] };
      await this.recordDecision(snapshot, decision);
      return decision;
    }
    const deterministic = deterministicDecision(
      snapshot,
      parsed.data,
      this.validatePolicy,
      this.validateExplanation,
    );
    if (!deterministic.ok) {
      const decision = correctionDecision(deterministic.codes);
      await this.recordDecision(snapshot, decision);
      return decision;
    }

    await this.record("validation_finished", "completed", snapshot, { validationCodes: [] });
    let modelDecision: z.infer<typeof supervisorOutputSchema>;
    try {
      await this.recordModel("model_requested", "running", snapshot);
      modelDecision = await this.model.generate({
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
      await this.recordModel("model_completed", "completed", snapshot);
    } catch (error) {
      await this.recordModel("model_failed", "invalid_output", snapshot);
      await this.record("agent_failed", "failed", snapshot);
      throw error;
    }
    const decision: SupervisorDecision = modelDecision.decision === "approve"
      ? { decision: "approve" }
      : correctionDecision(modelDecision.codes);
    try {
      await this.persist(snapshot, decision);
      await this.recordDecision(snapshot, decision);
      return decision;
    } catch (error) {
      await this.record("agent_failed", "failed", snapshot);
      throw error;
    }
  }

  private async persist(snapshot: CalculationSnapshot, decision: SupervisorDecision): Promise<void> {
    await this.dependencies.reviewProposal({
      runId: snapshot.runId,
      version: snapshot.proposalVersion,
      approved: decision.decision === "approve",
      codes: decision.decision === "approve" ? [] : decision.codes,
    });
  }

  private async recordDecision(snapshot: CalculationSnapshot, decision: SupervisorDecision): Promise<void> {
    await this.record(
      "validation_finished",
      decision.decision === "approve" ? "approved" : "rejected",
      snapshot,
      { validationCodes: decision.decision === "approve" ? [] : decision.codes },
    );
    await this.record(
      "agent_completed",
      decision.decision === "approve" ? "approved" : "rejected",
      snapshot,
    );
  }

  private async record(
    eventType: "agent_started" | "agent_completed" | "agent_failed" | "validation_finished",
    status: "running" | "completed" | "failed" | "approved" | "rejected",
    snapshot: CalculationSnapshot,
    extra: Omit<Parameters<AgentEventRecorder>[0], "runId" | "traceId" | "agent" | "eventType" | "status"> = {},
  ): Promise<void> {
    await this.recordEvent({
      runId: snapshot.runId,
      traceId: snapshot.traceId,
      agent: "supervisor",
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
      agent: "supervisor",
      eventType,
      status,
      model: this.model.model,
    });
  }
}

export async function runProposalReviewLoop(input: {
  calculation: CalculationAgent;
  supervisor: SupervisorAgent;
  snapshot: CalculationSnapshot;
  markRunFailed(runId: string, code: "AGENT_PROPOSAL_INVALID"): Promise<void>;
}): Promise<SupervisorDecision> {
  if (input.snapshot.missingTaskIds.length > 0) {
    return { decision: "correct", codes: ["MISSING_COVERAGE"] };
  }
  let lastDecision: SupervisorDecision = { decision: "correct", codes: ["INVALID_PROPOSAL"] };
  let correctionCodes: readonly string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptSnapshot: CalculationSnapshot = {
      ...input.snapshot,
      proposalVersion: input.snapshot.proposalVersion + attempt,
      correctionCodes,
    };
    const output = await input.calculation.propose(attemptSnapshot);
    lastDecision = await input.supervisor.review(attemptSnapshot, output);
    if (lastDecision.decision === "approve") return lastDecision;
    correctionCodes = lastDecision.codes;
  }
  await input.markRunFailed(input.snapshot.runId, "AGENT_PROPOSAL_INVALID");
  return lastDecision;
}
