import { createServiceSupabaseClient } from "@/lib/supabase/server";
import type { AgentName } from "./model";

export interface AgentEvent {
  runId: string;
  traceId: string;
  agent: AgentName;
  eventType: string;
  status?: string;
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
    payload.validationCodes = event.validationCodes.filter((code) =>
      /^[A-Z][A-Z0-9_]*$/.test(code),
    );
  }

  const counts = sanitizeCounts(event.counts);
  if (counts) payload.counts = counts;

  return payload;
}

export async function recordAgentEvent(event: AgentEvent): Promise<void> {
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
