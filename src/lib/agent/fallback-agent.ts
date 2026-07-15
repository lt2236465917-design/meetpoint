import { z } from "zod";

const coverageSchema = z.object({
  taskId: z.string().min(1),
  errorCode: z.string().min(1),
  retryAfter: z.iso.datetime({ offset: true }).nullable(),
  recoveryAttemptCount: z.number().int().nonnegative(),
  secondaryAdapterConfigured: z.boolean(),
}).strict();

const recoveryActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wait_until"), taskId: z.string(), retryAt: z.string() }).strict(),
  z.object({ type: z.literal("rerun_task"), taskId: z.string() }).strict(),
  z.object({ type: z.literal("try_configured_adapter"), taskId: z.string() }).strict(),
  z.object({ type: z.literal("stop_incomplete"), taskId: z.string(), runStatus: z.literal("incomplete") }).strict(),
]);

export type RecoveryCoverage = z.infer<typeof coverageSchema>;
export type RecoveryAction = z.infer<typeof recoveryActionSchema>;

export class FallbackAgent {
  private readonly now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  decide(input: RecoveryCoverage): RecoveryAction {
    const coverage = coverageSchema.parse(input);
    const retryAt = coverage.retryAfter ? new Date(coverage.retryAfter) : null;
    if (retryAt && retryAt.getTime() > this.now().getTime()) {
      return recoveryActionSchema.parse({
        type: "wait_until",
        taskId: coverage.taskId,
        retryAt: coverage.retryAfter,
      });
    }
    if (coverage.errorCode === "PROVIDER_RATE_LIMITED" || coverage.recoveryAttemptCount >= 2) {
      return recoveryActionSchema.parse({
        type: "stop_incomplete",
        taskId: coverage.taskId,
        runStatus: "incomplete",
      });
    }
    if (coverage.secondaryAdapterConfigured) {
      return recoveryActionSchema.parse({ type: "try_configured_adapter", taskId: coverage.taskId });
    }
    return recoveryActionSchema.parse({ type: "rerun_task", taskId: coverage.taskId });
  }
}
