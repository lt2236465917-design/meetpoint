export function queryConcurrencyFromEnv(value = process.env.AGENT_QUERY_CONCURRENCY): number {
  if (value === undefined || value.trim() === "") return 4;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(8, Math.max(1, Math.trunc(parsed)));
}

function normalizeConcurrency(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return queryConcurrencyFromEnv();
  return Math.min(8, Math.max(1, Math.trunc(value)));
}

export async function runQueryPool(
  taskIds: readonly string[],
  options: {
    logicalConcurrency?: number;
    execute: (taskId: string) => Promise<unknown>;
  },
): Promise<void> {
  if (taskIds.length === 0) return;
  const configured = normalizeConcurrency(options.logicalConcurrency);
  const workerCount = Math.min(configured, taskIds.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;
  async function worker() {
    while (!failed && nextIndex < taskIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        await options.execute(taskIds[index]!);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
  }
  await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));
  if (failed) throw firstError;
}
