import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

import type {
  QueryOutcome,
  RecommendationProposal,
  RouteTask,
  RunStatus,
  ValidationDecision,
  VerifiedQuote,
} from "@/lib/agent/contracts";
import { calculationOutputSchema } from "@/lib/agent/contracts";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { staleAfterForStatus } from "@/lib/recommendation/run-deadlines";
import {
  WORKER_ADVANCEABLE_KINDS,
  WORKER_ADVANCEABLE_STATUSES,
  isWorkerAdvanceableStatus,
  type WorkerAdvanceableRun,
} from "@/lib/recommendation/run-worker";
import type { RouteTaskDraft } from "./query-matrix";
import type { BaselineRecommendation } from "./baseline";

export type CandidateRecord = {
  cityCode: string;
  cityName: string;
  source: "system";
};

export type StoredRouteTask = RouteTask & { arrivalDate: string };

export type StoredRecommendationRun = {
  id: string;
  planId: string;
  status: RunStatus;
  traceId: string;
  retryAfter: string | null;
  staleAfter: string | null;
  errorCode: string | null;
  policyVersion: string;
  kind: "automatic" | "alternative";
  arrivalDate: string;
  participantIds: string[];
};

export type ApprovedProposal = {
  id: string;
  version: number;
  output: RecommendationProposal;
};

export type CreateRunMatrixInput = {
  planId: string;
  arrivalDate: string;
  candidates: CandidateRecord[];
  tasks: RouteTaskDraft[];
  kind?: "automatic" | "alternative";
  requestedCityCode?: string | null;
  requestedByParticipantId?: string | null;
  baseline?: BaselineRecommendation | null;
};

export const runCreationErrorCodes = [
  "CALCULATION_IN_PROGRESS",
  "SHARED_RESULT_EXISTS",
  "SHARED_RESULT_REQUIRED",
] as const;
export type RunCreationErrorCode = typeof runCreationErrorCodes[number];

export type ActiveRunStatus = Exclude<RunStatus, "completed" | "incomplete" | "failed">;

export type PreparedRun =
  | { disposition: "created"; runId: string; status: "pending"; taskIds: string[] }
  | { disposition: "resume_existing"; runId: string; status: ActiveRunStatus; taskIds: [] };

export type RunCreationResult = Pick<PreparedRun, "disposition" | "runId" | "status">;

export class RunCreationError extends Error {
  constructor(readonly code: RunCreationErrorCode) {
    super(code);
    this.name = "RunCreationError";
  }
}

export type SavedAgentProposal = {
  proposalId: string;
  runId: string;
  version: number;
  policyVersion: string;
  output: unknown;
  validationDecision: ValidationDecision;
  status: "pending" | "rejected";
};

export type ProposalReview = {
  runId: string;
  version: number;
  approved: boolean;
  codes: string[];
};

export interface AgentProposalRepository {
  saveProposal(input: SavedAgentProposal): Promise<void>;
  reviewProposal(input: ProposalReview): Promise<void>;
  markRunFailed(runId: string, code: "AGENT_PROPOSAL_INVALID"): Promise<void>;
}

export interface RecommendationRepository {
  createRunMatrix(input: CreateRunMatrixInput): Promise<PreparedRun>;
  getRouteTask(taskId: string): Promise<StoredRouteTask | null>;
  markTaskRunning(taskId: string): Promise<StoredRouteTask>;
  saveTaskOutcome(taskId: string, outcome: QueryOutcome): Promise<void>;
  updateRunStatus(
    runId: string,
    status: RunStatus,
    retryAfter?: string | null,
    expectedStatus?: RunStatus,
  ): Promise<void>;
}

export interface RunOrchestratorRepository extends RecommendationRepository, AgentProposalRepository {
  markTaskRecoveryExhausted(
    taskId: string,
    errorCode: string,
    staleAfter: string,
  ): Promise<boolean>;
  getRun(runId: string): Promise<StoredRecommendationRun | null>;
  compareAndSetRunStatus(
    runId: string,
    expectedStatus: RunStatus,
    nextStatus: RunStatus,
    options?: {
      retryAfter?: string | null;
      errorCode?: string | null;
      staleAfter?: string | null;
    },
  ): Promise<boolean>;
  tryAcquireAdvanceLease(input: {
    runId: string;
    expectedStatus: RunStatus;
    token: string;
    now: string;
    expiresAt: string;
    staleAfter: string;
  }): Promise<boolean>;
  expireStaleRun(
    runId: string,
    expectedStatus: RunStatus,
    now: string,
  ): Promise<boolean>;
  releaseAdvanceLease(runId: string, token: string): Promise<void>;
  failAdvance(runId: string, token: string, errorCode: string): Promise<boolean>;
  listWorkerAdvanceableRuns(): Promise<WorkerAdvanceableRun[]>;
  listRunTasks(runId: string): Promise<StoredRouteTask[]>;
  listVerifiedQuotes(runId: string): Promise<VerifiedQuote[]>;
  getLatestApprovedProposal(runId: string): Promise<ApprovedProposal | null>;
  materializeApprovedProposal(runId: string, proposalId: string): Promise<string>;
  publishSharedResult(runId: string, proposalId: string): Promise<void>;
}

function uuidFromSeed(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

export function deterministicRouteTaskId(runId: string, task: RouteTaskDraft): string {
  return uuidFromSeed([
    "route-task",
    runId,
    task.participantId,
    task.cityCode,
    task.mode,
    task.searchDate,
  ].join(":"));
}

export function deterministicVerifiedQuoteId(
  runId: string,
  participantId: string,
  quoteId: string,
): string {
  return uuidFromSeed(["verified-quote", runId, participantId, quoteId].join(":"));
}

export function deterministicAgentProposalId(runId: string, version: number): string {
  return uuidFromSeed(["agent-proposal", runId, String(version)].join(":"));
}

type RouteTaskRow = {
  id: string;
  run_id: string;
  participant_id: string;
  city_code: string;
  origin_city_code: string;
  mode: RouteTask["mode"];
  search_date: string;
  physical_key: string;
  status: RouteTask["status"];
  attempt_count: number;
  retry_after: string | null;
  error_code: string | null;
  recommendation_runs: unknown;
  participants: unknown;
};

const ROUTE_TASK_SELECT = "id,run_id,participant_id,city_code,origin_city_code,mode,search_date,physical_key,status,attempt_count,retry_after,error_code,recommendation_runs!inner(plans!inner(meeting_date)),participants!inner(departure_city_name)";
const RUN_SELECT = "id,plan_id,status,trace_id,retry_after,stale_after,error_summary,policy_version,kind,plans!inner(meeting_date)";

function firstRelation(value: unknown): Record<string, unknown> | null {
  const relation = Array.isArray(value) ? value[0] : value;
  return typeof relation === "object" && relation !== null
    ? relation as Record<string, unknown>
    : null;
}

function taskArrivalDate(row: RouteTaskRow): string {
  const run = firstRelation(row.recommendation_runs);
  const plan = firstRelation(run?.plans);
  if (typeof plan?.meeting_date !== "string") {
    throw new Error(`Route task arrival date not found: ${row.id}`);
  }
  return plan.meeting_date;
}

function toStoredTask(row: RouteTaskRow): StoredRouteTask {
  const participant = firstRelation(row.participants);
  if (typeof participant?.departure_city_name !== "string") {
    throw new Error(`Route task origin city name not found: ${row.id}`);
  }
  return {
    id: row.id,
    runId: row.run_id,
    participantId: row.participant_id,
    cityCode: row.city_code,
    originCityCode: row.origin_city_code,
    originCityName: participant.departure_city_name,
    mode: row.mode,
    searchDate: row.search_date,
    arrivalDate: taskArrivalDate(row),
    physicalKey: row.physical_key,
    status: row.status,
    attemptCount: row.attempt_count,
    retryAfter: row.retry_after,
    errorCode: row.error_code,
  };
}

function toStoredRun(row: Record<string, unknown>): StoredRecommendationRun {
  const plan = firstRelation(row.plans);
  const status = typeof row.status === "string" ? row.status : "";
  const kind = row.kind;
  if (
    typeof row.id !== "string" ||
    typeof row.plan_id !== "string" ||
    typeof row.trace_id !== "string" ||
    typeof row.policy_version !== "string" ||
    typeof plan?.meeting_date !== "string" ||
    (typeof row.stale_after !== "string" && row.stale_after !== null) ||
    !["pending", "collecting", "cooling_down", "calculating", "validating", "awaiting_host_confirmation", "completed", "incomplete", "failed"].includes(status) ||
    (kind !== "automatic" && kind !== "alternative")
  ) {
    throw new Error("Invalid recommendation run record");
  }
  return {
    id: row.id,
    planId: row.plan_id,
    status: status as RunStatus,
    traceId: row.trace_id,
    retryAfter: typeof row.retry_after === "string" ? row.retry_after : null,
    staleAfter: row.stale_after,
    errorCode: typeof row.error_summary === "string" ? row.error_summary : null,
    policyVersion: row.policy_version,
    kind,
    arrivalDate: plan.meeting_date,
    participantIds: [],
  };
}

function toVerifiedQuote(row: Record<string, unknown>): VerifiedQuote {
  const requiredString = (key: string) => {
    const value = row[key];
    if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid verified quote ${key}`);
    return value;
  };
  const requiredNumber = (key: string) => {
    const value = row[key];
    if (typeof value !== "number" || !Number.isInteger(value)) throw new Error(`Invalid verified quote ${key}`);
    return value;
  };
  return {
    id: requiredString("id"), quoteId: requiredString("quote_id"),
    providerQuoteId: typeof row.provider_quote_id === "string" ? row.provider_quote_id : null,
    participantId: requiredString("participant_id"), cityCode: requiredString("city_code"),
    mode: requiredString("mode") as VerifiedQuote["mode"], searchDate: requiredString("search_date"),
    queriedAt: requiredString("queried_at"), priceCny: requiredNumber("price_cny"),
    departAt: requiredString("depart_at"), arriveAt: requiredString("arrive_at"),
    durationMinutes: requiredNumber("duration_minutes"), transferCount: requiredNumber("transfer_count"),
    isDirect: row.is_direct === true, serviceName: requiredString("service_name"),
  };
}

const activeRunStatusSchema = z.enum([
  "pending",
  "collecting",
  "cooling_down",
  "calculating",
  "validating",
  "awaiting_host_confirmation",
]);

const runMatrixResultSchema = z.discriminatedUnion("disposition", [
  z.object({
    disposition: z.literal("created"),
    runId: z.uuid(),
    status: z.literal("pending"),
    taskIds: z.array(z.uuid()).min(1),
  }).strict(),
  z.object({
    disposition: z.literal("resume_existing"),
    runId: z.uuid(),
    status: activeRunStatusSchema,
    taskIds: z.tuple([]),
  }).strict(),
  z.object({
    disposition: z.literal("rejected"),
    code: z.enum(runCreationErrorCodes),
  }).strict(),
]);

export class SupabaseRecommendationRepository
  implements RunOrchestratorRepository {
  async createRunMatrix(input: CreateRunMatrixInput): Promise<PreparedRun> {
    const supabase = createServiceSupabaseClient();
    const runId = randomUUID();
    const taskIds = input.tasks.map((task) => deterministicRouteTaskId(runId, task));
    const { data, error } = await supabase.rpc("create_recommendation_run_matrix", {
      p_run_id: runId,
      p_plan_id: input.planId,
      p_arrival_date: input.arrivalDate,
      p_candidates: input.candidates.map((candidate) => ({
        city_code: candidate.cityCode,
        city_name: candidate.cityName,
        source: candidate.source,
      })),
      p_tasks: input.tasks.map((task, index) => ({
        id: taskIds[index],
        participant_id: task.participantId,
        city_code: task.cityCode,
        origin_city_code: task.originCityCode,
        mode: task.mode,
        search_date: task.searchDate,
        physical_key: task.physicalKey,
      })),
      p_kind: input.kind ?? "automatic",
      p_requested_city_code: input.requestedCityCode ?? null,
      p_requested_by_participant_id: input.requestedByParticipantId ?? null,
    });
    if (error) throw new Error(`Failed to create recommendation run matrix: ${error.message}`);
    const parsed = runMatrixResultSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error("Failed to create recommendation run matrix: invalid RPC result");
    }
    if (parsed.data.disposition === "rejected") {
      throw new RunCreationError(parsed.data.code);
    }
    if (parsed.data.disposition === "created" && (
      parsed.data.runId !== runId
      || parsed.data.taskIds.length !== taskIds.length
      || parsed.data.taskIds.some((id, index) => id !== taskIds[index])
    )) {
      throw new Error("Failed to create recommendation run matrix: invalid RPC result");
    }
    if (input.kind !== "alternative" && input.baseline) {
      const { error: baselineError } = await supabase.rpc("ensure_run_baseline", {
        p_run_id: parsed.data.runId,
        p_city_code: input.baseline.cityCode,
        p_city_name: input.baseline.cityName,
        p_policy_version: input.baseline.policyVersion,
        p_evidence_level: input.baseline.evidenceLevel,
        p_input_fingerprint: input.baseline.inputFingerprint,
      });
      if (baselineError) throw new Error(`Failed to persist baseline recommendation: ${baselineError.message}`);
    }
    const { error: priorityError } = await supabase.rpc("ensure_run_task_priorities", {
      p_run_id: parsed.data.runId,
      p_priorities: input.tasks.map((task, priority) => ({
        participant_id: task.participantId,
        city_code: task.cityCode,
        mode: task.mode,
        search_date: task.searchDate,
        priority,
      })),
    });
    if (priorityError) throw new Error(`Failed to persist route task priorities: ${priorityError.message}`);
    return parsed.data;
  }

  async getRouteTask(taskId: string): Promise<StoredRouteTask | null> {
    const { data, error } = await createServiceSupabaseClient()
      .from("route_tasks")
      .select(ROUTE_TASK_SELECT)
      .eq("id", taskId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load route task: ${error.message}`);
    return data ? toStoredTask(data as RouteTaskRow) : null;
  }

  async markTaskRunning(taskId: string): Promise<StoredRouteTask> {
    const current = await this.getRouteTask(taskId);
    if (!current) throw new Error(`Route task not found: ${taskId}`);
    const { data, error } = await createServiceSupabaseClient()
      .from("route_tasks")
      .update({
        status: "running",
        attempt_count: current.attemptCount + 1,
        retry_after: null,
        error_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .in("status", ["pending", "retryable_failure"])
      .select(ROUTE_TASK_SELECT)
      .single();
    if (error || !data) throw new Error(`Failed to start route task: ${error?.message ?? taskId}`);
    return toStoredTask(data as RouteTaskRow);
  }

  async saveTaskOutcome(taskId: string, outcome: QueryOutcome): Promise<void> {
    const quotes = outcome.status === "success"
      ? [...new Map(outcome.quotes.map((quote) => [quote.quoteId, quote])).values()]
      : [];
    const outcomePayload = outcome.status === "retryable_failure"
      ? {
          status: outcome.status,
          code: outcome.code,
          retry_after: new Date(Date.now() + outcome.retryAfterMs).toISOString(),
        }
      : outcome.status === "terminal_failure"
        ? { status: outcome.status, code: outcome.code }
        : { status: outcome.status };
    const { data, error } = await createServiceSupabaseClient().rpc(
      "save_route_task_outcome",
      {
        p_task_id: taskId,
        p_outcome: outcomePayload,
        p_quotes: quotes.map((quote) => ({
          id: quote.id,
          participant_id: quote.participantId,
          city_code: quote.cityCode,
          quote_id: quote.quoteId,
          provider_quote_id: quote.providerQuoteId,
          mode: quote.mode,
          search_date: quote.searchDate,
          queried_at: quote.queriedAt,
          provider: "flyai",
          price_cny: quote.priceCny,
          depart_at: quote.departAt,
          arrive_at: quote.arriveAt,
          duration_minutes: quote.durationMinutes,
          transfer_count: quote.transferCount,
          is_direct: quote.isDirect,
          service_name: quote.serviceName,
          evidence_ref: quote.quoteId,
        })),
      },
    );
    if (error) throw new Error(`Failed to persist task outcome: ${error.message}`);
    if (data !== true) throw new Error("Failed to persist task outcome: invalid RPC result");
  }

  async markTaskRecoveryExhausted(
    taskId: string,
    errorCode: string,
    staleAfter: string,
  ): Promise<boolean> {
    const { data, error } = await createServiceSupabaseClient().rpc(
      "terminalize_route_task_recovery",
      {
        p_task_id: taskId,
        p_error_code: errorCode,
        p_stale_after: staleAfter,
      },
    );
    if (error) throw new Error(`Failed to terminalize route task recovery: ${error.message}`);
    if (typeof data !== "boolean") {
      throw new Error("Failed to terminalize route task recovery: invalid RPC result");
    }
    return data;
  }

  async updateRunStatus(
    runId: string,
    status: RunStatus,
    retryAfter: string | null = null,
    expectedStatus?: RunStatus,
  ) {
    let query = createServiceSupabaseClient().from("recommendation_runs").update({
      status,
      retry_after: retryAfter,
      stale_after: staleAfterForStatus(status, new Date()),
    }).eq("id", runId);
    if (expectedStatus) query = query.eq("status", expectedStatus);
    const { data, error } = await query.select("id");
    if (error) throw new Error(`Failed to update recommendation run: ${error.message}`);
    if (!Array.isArray(data) || data.length !== 1 || data[0]?.id !== runId) {
      throw new Error("Failed to update recommendation run: expected exactly one row");
    }
  }

  async getRun(runId: string): Promise<StoredRecommendationRun | null> {
    const { data, error } = await createServiceSupabaseClient()
      .from("recommendation_runs")
      .select(RUN_SELECT)
      .eq("id", runId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load recommendation run: ${error.message}`);
    if (!data) return null;
    const stored = toStoredRun(data as Record<string, unknown>);
    const { data: participants, error: participantsError } = await createServiceSupabaseClient()
      .from("participants")
      .select("id")
      .eq("plan_id", stored.planId)
      .order("id", { ascending: true });
    if (participantsError) throw new Error(`Failed to load run participants: ${participantsError.message}`);
    return {
      ...stored,
      participantIds: (participants ?? []).flatMap((participant) =>
        typeof participant.id === "string" ? [participant.id] : [],
      ),
    };
  }

  async compareAndSetRunStatus(
    runId: string,
    expectedStatus: RunStatus,
    nextStatus: RunStatus,
    options: {
      retryAfter?: string | null;
      errorCode?: string | null;
      staleAfter?: string | null;
    } = {},
  ): Promise<boolean> {
    const { data, error } = await createServiceSupabaseClient()
      .from("recommendation_runs")
      .update({
        status: nextStatus,
        retry_after: options.retryAfter ?? null,
        error_summary: options.errorCode ?? null,
        stale_after: options.staleAfter === undefined
          ? staleAfterForStatus(nextStatus, new Date())
          : options.staleAfter,
        ...(nextStatus === "completed" || nextStatus === "incomplete" || nextStatus === "failed"
          ? { completed_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", runId)
      .eq("status", expectedStatus)
      .select("id");
    if (error) throw new Error(`Failed to transition recommendation run: ${error.message}`);
    return Array.isArray(data) && data.length === 1 && data[0]?.id === runId;
  }

  async tryAcquireAdvanceLease(input: {
    runId: string;
    expectedStatus: RunStatus;
    token: string;
    now: string;
    expiresAt: string;
    staleAfter: string;
  }): Promise<boolean> {
    const { data, error } = await createServiceSupabaseClient()
      .from("recommendation_runs")
      .update({
        advance_lease_token: input.token,
        advance_lease_expires_at: input.expiresAt,
        stale_after: input.staleAfter,
      })
      .eq("id", input.runId)
      .eq("status", input.expectedStatus)
      .or(`advance_lease_expires_at.is.null,advance_lease_expires_at.lte.${input.now}`)
      .select("id");
    if (error) throw new Error(`Failed to acquire recommendation run lease: ${error.message}`);
    return Array.isArray(data) && data.length === 1 && data[0]?.id === input.runId;
  }

  async expireStaleRun(
    runId: string,
    expectedStatus: RunStatus,
    now: string,
  ): Promise<boolean> {
    const { data, error } = await createServiceSupabaseClient()
      .from("recommendation_runs")
      .update({
        status: "failed",
        error_summary: "RUN_STALE_EXPIRED",
        completed_at: now,
        stale_after: null,
        advance_lease_token: null,
        advance_lease_expires_at: null,
      })
      .eq("id", runId)
      .eq("status", expectedStatus)
      .lte("stale_after", now)
      .select("id");
    if (error) throw new Error(`Failed to expire stale recommendation run: ${error.message}`);
    return Array.isArray(data) && data.length === 1 && data[0]?.id === runId;
  }

  async releaseAdvanceLease(runId: string, token: string): Promise<void> {
    const { error } = await createServiceSupabaseClient()
      .from("recommendation_runs")
      .update({ advance_lease_token: null, advance_lease_expires_at: null })
      .eq("id", runId)
      .eq("advance_lease_token", token);
    if (error) throw new Error(`Failed to release recommendation run lease: ${error.message}`);
  }

  async failAdvance(runId: string, token: string, errorCode: string): Promise<boolean> {
    const { data, error } = await createServiceSupabaseClient()
      .from("recommendation_runs")
      .update({
        status: "failed",
        error_summary: errorCode,
        completed_at: new Date().toISOString(),
        advance_lease_token: null,
        advance_lease_expires_at: null,
        stale_after: null,
      })
      .eq("id", runId)
      .eq("advance_lease_token", token)
      .select("id");
    if (error) throw new Error(`Failed to fail recommendation run advance: ${error.message}`);
    return Array.isArray(data) && data.length === 1 && data[0]?.id === runId;
  }

  async listWorkerAdvanceableRuns(): Promise<WorkerAdvanceableRun[]> {
    const { data, error } = await createServiceSupabaseClient()
      .from("recommendation_runs")
      .select("id,plan_id,status,kind,started_at")
      .in("kind", [...WORKER_ADVANCEABLE_KINDS])
      .in("status", [...WORKER_ADVANCEABLE_STATUSES])
      .order("started_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(`Failed to list worker advanceable runs: ${error.message}`);
    return (data ?? []).flatMap((row) => {
      if (
        typeof row.id !== "string" ||
        typeof row.plan_id !== "string" ||
        typeof row.started_at !== "string" ||
        (row.kind !== "automatic" && row.kind !== "alternative") ||
        !isWorkerAdvanceableStatus(row.status)
      ) {
        return [];
      }
      return [{
        id: row.id,
        planId: row.plan_id,
        status: row.status,
        kind: row.kind,
        startedAt: row.started_at,
      }];
    });
  }

  async listRunTasks(runId: string): Promise<StoredRouteTask[]> {
    const { data, error } = await createServiceSupabaseClient()
      .from("route_tasks")
      .select(ROUTE_TASK_SELECT)
      .eq("run_id", runId)
      .order("query_priority", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true });
    if (error) throw new Error(`Failed to load route tasks: ${error.message}`);
    return (data ?? []).map((row) => toStoredTask(row as RouteTaskRow));
  }

  async listVerifiedQuotes(runId: string): Promise<VerifiedQuote[]> {
    const { data, error } = await createServiceSupabaseClient()
      .from("verified_quotes")
      .select("id,quote_id,provider_quote_id,participant_id,city_code,mode,search_date,queried_at,price_cny,depart_at,arrive_at,duration_minutes,transfer_count,is_direct,service_name")
      .eq("run_id", runId)
      .order("quote_id", { ascending: true });
    if (error) throw new Error(`Failed to load verified quotes: ${error.message}`);
    return (data ?? []).map((row) => toVerifiedQuote(row as Record<string, unknown>));
  }

  async getLatestApprovedProposal(runId: string): Promise<ApprovedProposal | null> {
    const { data, error } = await createServiceSupabaseClient()
      .from("recommendation_proposals")
      .select("id,version,output_json")
      .eq("run_id", runId)
      .eq("status", "approved")
      .order("version", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Failed to load approved proposal: ${error.message}`);
    const row = data?.[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    const parsed = z.object({ id: z.uuid(), version: z.number().int().positive(), output_json: z.unknown() })
      .safeParse(row);
    if (!parsed.success) throw new Error("Invalid approved proposal record");
    const output = calculationOutputSchema.safeParse(parsed.data.output_json);
    if (!output.success || output.data.status !== "proposal") {
      throw new Error("Invalid approved proposal output");
    }
    return { id: parsed.data.id, version: parsed.data.version, output: output.data };
  }

  async materializeApprovedProposal(runId: string, proposalId: string): Promise<string> {
    const { data, error } = await createServiceSupabaseClient().rpc("materialize_recommendation_result", {
      p_run_id: runId,
      p_proposal_id: proposalId,
    });
    if (error || typeof data !== "string" || !z.uuid().safeParse(data).success) {
      throw new Error("Failed to materialize approved recommendation result");
    }
    return data;
  }

  async publishSharedResult(runId: string, proposalId: string): Promise<void> {
    const { data, error } = await createServiceSupabaseClient().rpc("publish_shared_result", {
      p_run_id: runId,
      p_proposal_id: proposalId,
    });
    if (error || typeof data !== "string" || !z.uuid().safeParse(data).success) {
      throw new Error("Failed to publish guarded shared result");
    }
  }

  async saveProposal(input: SavedAgentProposal): Promise<void> {
    const { error } = await createServiceSupabaseClient()
      .from("recommendation_proposals")
      .insert({
        id: input.proposalId,
        run_id: input.runId,
        version: input.version,
        policy_version: input.policyVersion,
        status: input.status,
        output_json: input.output,
        validation_decision: input.validationDecision,
      });
    if (error) throw new Error("Failed to persist agent proposal");
  }

  async reviewProposal(input: ProposalReview): Promise<void> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const supabase = createServiceSupabaseClient();
      const { data, error } = await supabase
        .from("recommendation_proposals")
        .update({
          status: input.approved ? "approved" : "rejected",
          supervisor_approved_version: input.approved ? input.version : null,
          supervisor_codes: input.codes,
          reviewed_at: new Date().toISOString(),
        })
        .eq("run_id", input.runId)
        .eq("version", input.version)
        .eq("status", "pending")
        .select("id");
      if (!error && Array.isArray(data) && data.length === 1) return;

      if (!error) {
        const { data: current } = await supabase
          .from("recommendation_proposals")
          .select("status,supervisor_approved_version")
          .eq("run_id", input.runId)
          .eq("version", input.version)
          .maybeSingle();
        if (
          current
          && (
            (input.approved
              && current.status === "approved"
              && current.supervisor_approved_version === input.version)
            || (!input.approved && current.status === "rejected")
          )
        ) {
          return;
        }
        throw new Error("Failed to persist Supervisor review");
      }

      lastError = new Error("Failed to persist Supervisor review");
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
    throw lastError ?? new Error("Failed to persist Supervisor review");
  }

  async markRunFailed(
    runId: string,
    code: "AGENT_PROPOSAL_INVALID",
  ): Promise<void> {
    const { data, error } = await createServiceSupabaseClient()
      .from("recommendation_runs")
      .update({
        status: "failed",
        error_summary: code,
        completed_at: new Date().toISOString(),
        stale_after: null,
      })
      .eq("id", runId)
      .select("id");
    if (error || !Array.isArray(data) || data.length !== 1) {
      throw new Error("Failed to mark recommendation run failed");
    }
  }
}
