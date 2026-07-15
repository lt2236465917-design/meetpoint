export function queryConcurrencyFromEnv(value = process.env.AGENT_QUERY_CONCURRENCY): number {
  if (value === undefined || value.trim() === "") return 4;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(8, Math.max(1, Math.trunc(parsed)));
}

export async function runQueryPool(
  taskIds: readonly string[],
  options: {
    logicalConcurrency?: number;
    execute: (taskId: string) => Promise<unknown>;
  },
): Promise<void> {
  if (taskIds.length === 0) return;
  const configured = options.logicalConcurrency === undefined
    ? queryConcurrencyFromEnv()
    : Math.min(8, Math.max(1, Math.trunc(options.logicalConcurrency)));
  const workerCount = Math.min(configured, taskIds.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < taskIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      await options.execute(taskIds[index]!);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
