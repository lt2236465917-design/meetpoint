import { createAgentModel } from "@/lib/agent/deepseek-model";
import { CalculationAgent } from "@/lib/agent/calculation-agent";
import { FallbackAgent } from "@/lib/agent/fallback-agent";
import { QueryAgent } from "@/lib/agent/query-agent";
import { queryConcurrencyFromEnv, runQueryPool } from "@/lib/agent/query-pool";
import { SupervisorAgent } from "@/lib/agent/supervisor-agent";
import type { RunStatus } from "@/lib/agent/contracts";
import {
  SupabaseRecommendationRepository,
  type RunOrchestratorRepository as Repository,
  type StoredRecommendationRun,
  type StoredRouteTask,
} from "@/lib/recommendation/repository";
import { ManagerAgent } from "@/lib/agent/manager-agent";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { verifyParticipantCanCalculatePlan } from "@/lib/security/participant-calculation";
import { randomUUID } from "node:crypto";

export type StoredRun = StoredRecommendationRun;
export type RunOrchestratorRepository = Repository;

type QueryExecutor = Pick<QueryAgent, "execute">;

type RunOrchestratorOptions = {
  repository?: RunOrchestratorRepository;
  query?: QueryExecutor;
  logicalConcurrency?: number;
  now?: () => Date;
};

const terminalStatuses = new Set<RunStatus>(["completed", "incomplete", "failed"]);
const ADVANCE_LEASE_MS = 5 * 60 * 1000;
const allowedTransitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  pending: ["collecting", "failed"],
  collecting: ["cooling_down", "calculating", "incomplete", "failed"],
  cooling_down: ["collecting", "failed"],
  calculating: ["validating", "incomplete", "failed"],
  validating: ["completed", "failed"],
  awaiting_host_confirmation: ["completed", "failed"],
  completed: [],
  incomplete: [],
  failed: [],
};

function retryAt(tasks: readonly StoredRouteTask[]): string | null {
  return tasks
    .map((task) => task.retryAfter)
    .filter((value): value is string => typeof value === "string")
    .sort()
    .at(0) ?? null;
}

function eligibleCityCodes(
  run: StoredRun,
  tasks: readonly StoredRouteTask[],
  quotes: Awaited<ReturnType<RunOrchestratorRepository["listVerifiedQuotes"]>>,
): string[] {
  const taskParticipantsByCity = new Map<string, Set<string>>();
  for (const task of tasks) {
    const participantIds = taskParticipantsByCity.get(task.cityCode) ?? new Set<string>();
    participantIds.add(task.participantId);
    taskParticipantsByCity.set(task.cityCode, participantIds);
  }
  const quoteParticipantsByCity = new Map<string, Set<string>>();
  for (const quote of quotes) {
    const participantIds = quoteParticipantsByCity.get(quote.cityCode) ?? new Set<string>();
    participantIds.add(quote.participantId);
    quoteParticipantsByCity.set(quote.cityCode, participantIds);
  }
  return [...taskParticipantsByCity.keys()].filter((cityCode) => {
    const taskParticipants = taskParticipantsByCity.get(cityCode)!;
    const quoteParticipants = quoteParticipantsByCity.get(cityCode) ?? new Set<string>();
    return run.participantIds.every((participantId) =>
      taskParticipants.has(participantId) && quoteParticipants.has(participantId),
    );
  }).sort();
}

function hasCompleteCoverage(
  run: StoredRun,
  tasks: readonly StoredRouteTask[],
  quotes: Awaited<ReturnType<RunOrchestratorRepository["listVerifiedQuotes"]>>,
): boolean {
  return run.participantIds.length > 0 && eligibleCityCodes(run, tasks, quotes).length > 0;
}

function cityInputs(
  run: StoredRun,
  tasks: readonly StoredRouteTask[],
  quotes: Awaited<ReturnType<RunOrchestratorRepository["listVerifiedQuotes"]>>,
) {
  return eligibleCityCodes(run, tasks, quotes)
    .map((cityCode) => ({ cityCode, quotes: quotes.filter((quote) => quote.cityCode === cityCode) }));
}

export class RunOrchestrator {
  private readonly repository: RunOrchestratorRepository;
  private readonly query: QueryExecutor;
  private readonly logicalConcurrency: number;
  private readonly now: () => Date;

  constructor(options: RunOrchestratorOptions = {}) {
    this.repository = options.repository ?? new SupabaseRecommendationRepository();
    this.query = options.query ?? new QueryAgent(this.repository);
    this.logicalConcurrency = options.logicalConcurrency ?? queryConcurrencyFromEnv();
    this.now = options.now ?? (() => new Date());
  }

  async advanceRun(runId: string, expectedPlanId?: string): Promise<RunStatus> {
    const run = await this.repository.getRun(runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    if (expectedPlanId && run.planId !== expectedPlanId) throw new Error("RUN_NOT_FOUND");
    if (terminalStatuses.has(run.status) || run.status === "awaiting_host_confirmation") return run.status;

    const leaseToken = randomUUID();
    const now = this.now();
    const acquired = await this.repository.tryAcquireAdvanceLease({
      runId: run.id,
      expectedStatus: run.status,
      token: leaseToken,
      now: now.toISOString(),
      expiresAt: new Date(now.getTime() + ADVANCE_LEASE_MS).toISOString(),
    });
    if (!acquired) return (await this.repository.getRun(run.id))?.status ?? run.status;

    try {
      return await this.advanceOwnedRun(run);
    } catch {
      const failed = await this.repository.failAdvance(run.id, leaseToken, "RUN_ADVANCE_FAILED");
      if (failed) return "failed";
      return (await this.repository.getRun(run.id))?.status ?? run.status;
    } finally {
      await this.repository.releaseAdvanceLease(run.id, leaseToken);
    }
  }

  private async advanceOwnedRun(run: StoredRun): Promise<RunStatus> {
    if (run.status === "pending") return this.transition(run, "collecting");
    if (run.status === "cooling_down") {
      if (run.retryAfter && new Date(run.retryAfter).getTime() > this.now().getTime()) return "cooling_down";
      return this.transition(run, "collecting");
    }
    if (run.status === "collecting") return this.collect(run);
    if (run.status === "calculating") return this.calculate(run);
    if (run.status === "validating") return this.publish(run);
    return run.status;
  }

  private async transition(
    run: StoredRun,
    next: RunStatus,
    options: { retryAfter?: string | null; errorCode?: string | null } = {},
  ): Promise<RunStatus> {
    if (!allowedTransitions[run.status].includes(next)) {
      throw new Error(`Invalid recommendation run transition: ${run.status} -> ${next}`);
    }
    const moved = await this.repository.compareAndSetRunStatus(run.id, run.status, next, options);
    if (moved) return next;
    return (await this.repository.getRun(run.id))?.status ?? run.status;
  }

  private async collect(run: StoredRun): Promise<RunStatus> {
    const tasks = await this.repository.listRunTasks(run.id);
    const quotes = await this.repository.listVerifiedQuotes(run.id);
    if (hasCompleteCoverage(run, tasks, quotes)) return this.transition(run, "calculating");

    const now = this.now().getTime();
    const fallback = new FallbackAgent({ now: this.now });
    const recovery = new Map(tasks
      .filter((task) => task.status === "retryable_failure")
      .map((task) => [task.id, fallback.decide({
        taskId: task.id,
        errorCode: task.errorCode ?? "ROUTE_TASK_RETRYABLE_FAILURE",
        retryAfter: task.retryAfter,
        recoveryAttemptCount: Math.max(0, task.attemptCount - 1),
        secondaryAdapterConfigured: false,
      })]));
    if ([...recovery.values()].some((action) => action.type === "stop_incomplete")) {
      return this.transition(run, "incomplete", { errorCode: "REAL_QUOTE_COVERAGE_INCOMPLETE" });
    }
    const ready = tasks.filter((task) => task.status === "pending" || recovery.get(task.id)?.type === "rerun_task");
    if (ready.length > 0) {
      const batch = ready.slice(0, this.logicalConcurrency);
      await runQueryPool(batch.map((task) => task.id), {
        logicalConcurrency: this.logicalConcurrency,
        execute: (taskId) => this.query.execute(taskId),
      });
      return (await this.repository.getRun(run.id))?.status ?? "collecting";
    }

    const waitUntil = [...recovery.values()]
      .filter((action): action is Extract<typeof action, { type: "wait_until" }> => action.type === "wait_until")
      .map((action) => action.retryAt)
      .sort()
      .at(0) ?? retryAt(tasks.filter((task) => task.status === "retryable_failure"));
    if (waitUntil && new Date(waitUntil).getTime() > now) {
      return this.transition(run, "cooling_down", { retryAfter: waitUntil });
    }
    return this.transition(run, "incomplete", { errorCode: "REAL_QUOTE_COVERAGE_INCOMPLETE" });
  }

  private async calculate(run: StoredRun): Promise<RunStatus> {
    const [tasks, quotes] = await Promise.all([
      this.repository.listRunTasks(run.id),
      this.repository.listVerifiedQuotes(run.id),
    ]);
    if (!hasCompleteCoverage(run, tasks, quotes)) {
      return this.transition(run, "incomplete", { errorCode: "REAL_QUOTE_COVERAGE_INCOMPLETE" });
    }
    const model = createAgentModel();
    if (!model) return this.transition(run, "failed", { errorCode: "AGENT_MODEL_UNAVAILABLE" });
    const snapshot = {
      runId: run.id,
      traceId: run.traceId,
      proposalVersion: 1,
      policyVersion: run.policyVersion,
      arrivalDate: run.arrivalDate,
      participantIds: run.participantIds,
      cityInputs: cityInputs(run, tasks, quotes),
      missingTaskIds: [],
    };
    const calculation = new CalculationAgent(model, this.repository);
    const supervisor = new SupervisorAgent(model, this.repository);
    let correctionCodes: readonly string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const attemptSnapshot = { ...snapshot, proposalVersion: attempt + 1, correctionCodes };
      const output = await calculation.propose(attemptSnapshot);
      const decision = await supervisor.review(attemptSnapshot, output);
      if (decision.decision === "approve") return this.transition(run, "validating");
      correctionCodes = decision.codes;
    }
    await this.repository.markRunFailed(run.id, "AGENT_PROPOSAL_INVALID");
    return "failed";
  }

  private async publish(run: StoredRun): Promise<RunStatus> {
    const [proposal, quotes] = await Promise.all([
      this.repository.getLatestApprovedProposal(run.id),
      this.repository.listVerifiedQuotes(run.id),
    ]);
    if (!proposal) return this.transition(run, "failed", { errorCode: "AGENT_PROPOSAL_INVALID" });
    try {
      await this.repository.materializeApprovedProposal({ run, proposal, quotes });
      await this.repository.publishSharedResult(run.id, proposal.id);
    } catch {
      return this.transition(run, "failed", { errorCode: "PUBLICATION_GUARD_REJECTED" });
    }
    const current = await this.repository.getRun(run.id);
    if (current?.status === "completed") return "completed";
    throw new Error("Publication RPC did not complete recommendation run");
  }
}

type StartAutomaticRunInput = {
  code: string;
  participantToken: string;
};

export async function startAutomaticRun(input: StartAutomaticRunInput): Promise<{ runId: string; status: "pending" }> {
  const verified = await verifyParticipantCanCalculatePlan({
    code: input.code,
    participantToken: input.participantToken,
  });
  if (!verified.ok) throw new Error(verified.error);
  const supabase = createServiceSupabaseClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id,meeting_date")
    .eq("id", verified.planId)
    .eq("code", input.code)
    .single();
  if (planError || !plan) throw new Error("PLAN_NOT_FOUND");
  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("id,departure_city_code,departure_city_name,accepted_modes")
    .eq("plan_id", plan.id)
    .order("id", { ascending: true });
  if (participantsError || !participants || participants.length < 2) throw new Error("NOT_ENOUGH_PARTICIPANTS");
  const { data: candidates, error: candidatesError } = await supabase
    .from("candidate_cities")
    .select("city_code,source,enabled")
    .eq("plan_id", plan.id);
  if (candidatesError) throw new Error("RUN_CREATE_FAILED");
  const manualAddCityCodes = (candidates ?? []).filter((candidate) => candidate.source === "manual_add" && candidate.enabled).map((candidate) => candidate.city_code);
  const manualExcludeCityCodes = (candidates ?? []).filter((candidate) => candidate.source === "manual_exclude").map((candidate) => candidate.city_code);
  const repository = new SupabaseRecommendationRepository();
  try {
    const manager = new ManagerAgent(repository);
    const prepared = await manager.prepare({
      planId: plan.id,
      arrivalDate: plan.meeting_date,
      participants: participants.map((participant) => ({
        id: participant.id,
        departureCityCode: participant.departure_city_code,
        departureCityName: participant.departure_city_name,
        acceptedModes: participant.accepted_modes,
      })),
      manualAddCityCodes,
      manualExcludeCityCodes,
    });
    return { runId: prepared.runId, status: "pending" };
  } catch (error) {
    if (error instanceof Error && /duplicate key|unique/i.test(error.message)) throw new Error("CALCULATION_IN_PROGRESS");
    throw error;
  }
}

export async function advanceRun(input: { runId: string; planId: string }) {
  const status = await new RunOrchestrator().advanceRun(input.runId, input.planId);
  const run = await new SupabaseRecommendationRepository().getRun(input.runId);
  if (!run || run.planId !== input.planId) throw new Error("RUN_NOT_FOUND");
  return {
    runId: run.id,
    status,
    traceId: run.traceId,
    retryAt: run.retryAfter,
    diagnosticCode: run.errorCode,
  };
}
