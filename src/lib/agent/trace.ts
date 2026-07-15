import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { AgentName } from "./model";

const agentNames = new Set<AgentName>([
  "manager",
  "calculation",
  "supervisor",
  "fallback",
]);

const agentEventTypes = [
  "agent_started",
  "agent_completed",
  "agent_failed",
  "model_requested",
  "model_completed",
  "model_failed",
  "proposal_created",
  "proposal_validated",
  "validation_finished",
  "retry_scheduled",
] as const;

const agentEventStatuses = [
  "started",
  "running",
  "completed",
  "failed",
  "approved",
  "rejected",
  "timeout",
  "invalid_output",
  "unavailable",
] as const;

export type AgentEventType = (typeof agentEventTypes)[number];
export type AgentEventStatus = (typeof agentEventStatuses)[number];

const eventTypes = new Set<string>(agentEventTypes);
const eventStatuses = new Set<string>(agentEventStatuses);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modelPattern = /^[a-z0-9][a-z0-9._:/-]{0,99}$/i;
const sensitiveValue =
  /(authorization|token|secret|bookingurl|rawpayload|participantname|prompt|message)/i;

export interface AgentEvent {
  runId: string;
  traceId: string;
  agent: AgentName;
  eventType: AgentEventType;
  status?: AgentEventStatus;
  durationMs?: number;
  model?: string;
  taskId?: string;
  proposalId?: string;
  validationCodes?: string[];
  counts?: Record<string, number>;
  [key: string]: unknown;
}

const forbiddenCountKey =
  /(authorization|token|secret|bookingurl|rawpayload|name|prompt|message|system|input|auth|env)/i;

function isSafeModelName(model: string): boolean {
  return (
    modelPattern.test(model) &&
    !model.includes("://") &&
    !model.toLowerCase().startsWith("sk-") &&
    !sensitiveValue.test(model)
  );
}

function assertSafeEvent(event: AgentEvent): void {
  const ids = [event.runId, event.traceId, event.taskId, event.proposalId];
  const valid =
    agentNames.has(event.agent) &&
    eventTypes.has(event.eventType) &&
    (event.status === undefined || eventStatuses.has(event.status)) &&
    ids.every(
      (id) => id === undefined || (typeof id === "string" && uuidPattern.test(id)),
    ) &&
    (event.model === undefined ||
      (typeof event.model === "string" && isSafeModelName(event.model)));

  if (!valid) throw new Error("Invalid agent event");
}

function sanitizeCounts(
  counts: Record<string, number> | undefined,
): Record<string, number> | undefined {
  if (!counts) return undefined;

  const sanitized = Object.fromEntries(
    Object.entries(counts).filter(
      ([key, value]) =>
        key.endsWith("Count") &&
        !forbiddenCountKey.test(key) &&
        Number.isSafeInteger(value) &&
        value >= 0,
    ),
  );
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function buildPayload(event: AgentEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (event.status !== undefined) payload.status = event.status;
  if (Number.isFinite(event.durationMs) && event.durationMs! >= 0) {
    payload.durationMs = event.durationMs;
  }
  if (event.model !== undefined) payload.model = event.model;
  if (event.taskId !== undefined) payload.taskId = event.taskId;
  if (event.proposalId !== undefined) payload.proposalId = event.proposalId;
  if (event.validationCodes !== undefined) {
    payload.validationCodes = event.validationCodes.filter(
      (code) =>
        /^[A-Z][A-Z0-9_]{0,63}$/.test(code) && !sensitiveValue.test(code),
    );
  }

  const counts = sanitizeCounts(event.counts);
  if (counts) payload.counts = counts;

  return payload;
}

export async function recordAgentEvent(event: AgentEvent): Promise<void> {
  assertSafeEvent(event);
  const { error } = await createServiceSupabaseClient()
    .from("agent_events")
    .insert({
      run_id: event.runId,
      trace_id: event.traceId,
      agent_name: event.agent,
      event_type: event.eventType,
      payload: buildPayload(event),
    });

  if (error) throw new Error("Failed to record agent event");
}
