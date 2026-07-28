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

export type AdvanceRunFn = (input: {
  runId: string;
  planId: string;
}) => Promise<unknown>;

export type RunWorkerDeps = {
  listRuns: () => Promise<WorkerAdvanceableRun[]>;
  advanceRun: AdvanceRunFn;
  logError?: (message: string, context: Record<string, unknown>) => void;
};

export async function runWorkerTick(
  deps: RunWorkerDeps,
): Promise<WorkerAdvanceableRun | null> {
  const selected = selectNextWorkerRun(await deps.listRuns());
  if (!selected) return null;
  try {
    await deps.advanceRun({ runId: selected.id, planId: selected.planId });
  } catch (error) {
    (deps.logError ?? console.error)("[recommendation-run-worker] advance failed", {
      runId: selected.id,
      planId: selected.planId,
      status: selected.status,
      kind: selected.kind,
      error,
    });
  }
  return selected;
}

export type RunWorkerLoopOptions = RunWorkerDeps & {
  pollIntervalMs: number;
  maxInFlight?: number;
  signal?: AbortSignal;
  onHeartbeat?: () => void | Promise<void>;
  sleep?: (ms: number) => Promise<void>;
};

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWorkerLoop(options: RunWorkerLoopOptions): Promise<void> {
  const maxInFlight = options.maxInFlight ?? 1;
  if (maxInFlight !== 1) {
    throw new Error("RUN_WORKER_MAX_IN_FLIGHT must be 1 in v1");
  }
  const sleep = options.sleep ?? defaultSleep;

  while (!options.signal?.aborted) {
    await runWorkerTick(options);
    if (options.signal?.aborted) break;
    await options.onHeartbeat?.();
    await sleep(options.pollIntervalMs);
  }
}
