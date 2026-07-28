export const WORKER_ADVANCEABLE_KINDS = ["automatic", "alternative"] as const;
export const WORKER_ADVANCEABLE_STATUSES = [
  "pending",
  "collecting",
  "cooling_down",
  "calculating",
  "validating",
] as const;

export type WorkerAdvanceableKind = (typeof WORKER_ADVANCEABLE_KINDS)[number];
export type WorkerAdvanceableStatus = (typeof WORKER_ADVANCEABLE_STATUSES)[number];

export type WorkerAdvanceableRun = {
  id: string;
  planId: string;
  status: WorkerAdvanceableStatus;
  kind: WorkerAdvanceableKind;
  startedAt: string;
};

export function isWorkerAdvanceableStatus(
  status: string,
): status is WorkerAdvanceableStatus {
  return (WORKER_ADVANCEABLE_STATUSES as readonly string[]).includes(status);
}

export function selectNextWorkerRun(
  runs: readonly WorkerAdvanceableRun[],
): WorkerAdvanceableRun | null {
  if (runs.length === 0) return null;
  return [...runs].sort((left, right) => {
    const byStarted = left.startedAt.localeCompare(right.startedAt);
    if (byStarted !== 0) return byStarted;
    return left.id.localeCompare(right.id);
  })[0] ?? null;
}
