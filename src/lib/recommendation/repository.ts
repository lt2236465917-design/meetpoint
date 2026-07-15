import { createHash, randomUUID } from "node:crypto";

import type { QueryOutcome, RouteTask, RunStatus } from "@/lib/agent/contracts";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { RouteTaskDraft } from "./query-matrix";

export type CandidateRecord = {
  cityCode: string;
  cityName: string;
  source: "system";
};

export type StoredRouteTask = RouteTask & { arrivalDate: string };

export type CreateRunMatrixInput = {
  planId: string;
  arrivalDate: string;
  candidates: CandidateRecord[];
  tasks: RouteTaskDraft[];
};

export interface RecommendationRepository {
  createRunMatrix(input: CreateRunMatrixInput): Promise<{ runId: string; taskIds: string[] }>;
  getRouteTask(taskId: string): Promise<StoredRouteTask | null>;
  markTaskRunning(taskId: string): Promise<StoredRouteTask>;
  saveTaskOutcome(taskId: string, outcome: QueryOutcome): Promise<void>;
  updateRunStatus(runId: string, status: RunStatus, retryAfter?: string | null): Promise<void>;
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
};

const ROUTE_TASK_SELECT = "id,run_id,participant_id,city_code,origin_city_code,mode,search_date,physical_key,status,attempt_count,retry_after,error_code,recommendation_runs!inner(plans!inner(meeting_date))";

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
  return {
    id: row.id,
    runId: row.run_id,
    participantId: row.participant_id,
    cityCode: row.city_code,
    originCityCode: row.origin_city_code,
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

function outcomeTaskFields(outcome: QueryOutcome) {
  switch (outcome.status) {
    case "success": return { status: "succeeded", retry_after: null, error_code: null } as const;
    case "empty": return { status: "empty", retry_after: null, error_code: null } as const;
    case "terminal_failure":
      return { status: "terminal_failure", retry_after: null, error_code: outcome.code } as const;
    case "retryable_failure":
      return {
        status: "retryable_failure",
        retry_after: new Date(Date.now() + outcome.retryAfterMs).toISOString(),
        error_code: outcome.code,
      } as const;
  }
}

export class SupabaseRecommendationRepository implements RecommendationRepository {
  async createRunMatrix(input: CreateRunMatrixInput) {
    const supabase = createServiceSupabaseClient();
    const runId = randomUUID();
    const taskIds = input.tasks.map((task) => deterministicRouteTaskId(runId, task));
    const { error: runError } = await supabase.from("recommendation_runs").insert({
      id: runId,
      plan_id: input.planId,
      status: "pending",
      kind: "automatic",
    });
    if (runError) throw new Error(`Failed to create recommendation run: ${runError.message}`);

    const { error: candidateError } = await supabase.from("candidate_cities").upsert(
      input.candidates.map((candidate) => ({
        plan_id: input.planId,
        city_code: candidate.cityCode,
        city_name: candidate.cityName,
        source: candidate.source,
        enabled: true,
      })),
      { onConflict: "plan_id,city_code,source" },
    );
    if (candidateError) throw new Error(`Failed to persist candidates: ${candidateError.message}`);

    const { error: taskError } = await supabase.from("route_tasks").insert(
      input.tasks.map((task, index) => ({
        id: taskIds[index],
        run_id: runId,
        participant_id: task.participantId,
        city_code: task.cityCode,
        origin_city_code: task.originCityCode,
        mode: task.mode,
        search_date: task.searchDate,
        physical_key: task.physicalKey,
        status: "pending",
      })),
    );
    if (taskError) throw new Error(`Failed to persist route tasks: ${taskError.message}`);
    return { runId, taskIds };
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
    const task = await this.getRouteTask(taskId);
    if (!task) throw new Error(`Route task not found: ${taskId}`);
    const supabase = createServiceSupabaseClient();
    if (outcome.status === "success") {
      const { error: quoteError } = await supabase.from("verified_quotes").upsert(
        outcome.quotes.map((quote) => ({
          id: quote.id,
          route_task_id: taskId,
          run_id: task.runId,
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
        { onConflict: "run_id,participant_id,quote_id" },
      );
      if (quoteError) throw new Error(`Failed to persist verified quotes: ${quoteError.message}`);
    }
    const { error } = await supabase.from("route_tasks").update({
      ...outcomeTaskFields(outcome),
      updated_at: new Date().toISOString(),
    }).eq("id", taskId).eq("status", "running");
    if (error) throw new Error(`Failed to persist task outcome: ${error.message}`);
  }

  async updateRunStatus(runId: string, status: RunStatus, retryAfter: string | null = null) {
    const { error } = await createServiceSupabaseClient().from("recommendation_runs").update({
      status,
      retry_after: retryAfter,
    }).eq("id", runId);
    if (error) throw new Error(`Failed to update recommendation run: ${error.message}`);
  }
}
