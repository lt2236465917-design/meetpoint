import type { RunStatus } from "@/lib/agent/contracts";

export const ACTIVE_RUN_STALE_MS = 15 * 60 * 1000;
export const PREVIEW_CONFIRMATION_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function staleAfterForStatus(status: RunStatus, now: Date): string | null {
  if (["completed", "incomplete", "failed"].includes(status)) return null;
  const ttl = status === "awaiting_host_confirmation"
    ? PREVIEW_CONFIRMATION_STALE_MS
    : ACTIVE_RUN_STALE_MS;
  return new Date(now.getTime() + ttl).toISOString();
}
