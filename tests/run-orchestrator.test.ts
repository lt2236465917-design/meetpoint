import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/deepseek-model", () => ({
  createAgentModel: vi.fn(() => null),
}));

vi.mock("@/lib/agent/trace", () => ({
  isTrustedAgentModel: (value: string) => value === "deepseek-v4-flash",
  recordAgentEvent: vi.fn(async () => undefined),
}));

import type { RunOrchestratorRepository, StoredRun } from "@/lib/agent/run-orchestrator";
import { RunOrchestrator } from "@/lib/agent/run-orchestrator";
import { createAgentModel } from "@/lib/agent/deepseek-model";
import { AgentModelError } from "@/lib/agent/model";
import type { VerifiedQuote } from "@/lib/agent/contracts";
import type { StoredRouteTask } from "@/lib/recommendation/repository";

function run(status: StoredRun["status"]): StoredRun {
  const staleAfter = ["completed", "incomplete", "failed"].includes(status)
    ? null
    : "2999-01-01T00:00:00.000Z";
  return {
    id: "run-1", planId: "plan-1", status, traceId: "11111111-1111-4111-8111-111111111111",
    retryAfter: null, staleAfter, errorCode: null, policyVersion: "2026-07-19.v2", kind: "automatic",
    arrivalDate: "2026-08-15", participantIds: ["p1", "p2"],
  };
}

function task(overrides: Partial<StoredRouteTask> = {}): StoredRouteTask {
  return {
    id: "task-1", runId: "run-1", participantId: "p1", cityCode: "beijing",
    originCityCode: "shanghai", mode: "flight", searchDate: "2026-08-15", arrivalDate: "2026-08-15",
    physicalKey: "shanghai:beijing:flight:2026-08-15", status: "pending", attemptCount: 0,
    retryAfter: null, errorCode: null, ...overrides,
  };
}

function quote(participantId: string, cityCode: string): VerifiedQuote {
  return {
    id: `quote-${participantId}-${cityCode}`,
    quoteId: `flyai:${"a".repeat(64)}`,
    providerQuoteId: null,
    participantId,
    cityCode,
    mode: "flight",
    searchDate: "2026-08-15",
    queriedAt: "2026-08-01T00:00:00.000Z",
    priceCny: 100,
    departAt: "2026-08-15T00:00:00.000Z",
    arriveAt: "2026-08-15T01:00:00.000Z",
    durationMinutes: 60,
    transferCount: 0,
    isDirect: true,
    serviceName: "MU1000",
  };
}

function repository(input: { current: StoredRun; tasks?: StoredRouteTask[]; quotes?: VerifiedQuote[] }): RunOrchestratorRepository & {
  transitions: Array<[string, string]>;
  leased: boolean;
} {
  const value = {
    current: input.current,
    tasks: input.tasks ?? [],
    quotes: input.quotes ?? [],
    transitions: [] as Array<[string, string]>,
    leased: false,
    async getRun() { return this.current; },
    async createRunMatrix() { throw new Error("not reached"); },
    async getRouteTask() { return null; },
    async markTaskRunning() { throw new Error("not reached"); },
    async saveTaskOutcome() {},
    async markTaskRecoveryExhausted() { return true; },
    async expireStaleRun() { return false; },
    async updateRunStatus() {},
    async compareAndSetRunStatus(_runId: string, expected: StoredRun["status"], next: StoredRun["status"]) {
      if (this.current.status !== expected) return false;
      this.transitions.push([expected, next]);
      this.current = { ...this.current, status: next };
      return true;
    },
    async tryAcquireAdvanceLease() {
      if (this.leased) return false;
      this.leased = true;
      return true;
    },
    async releaseAdvanceLease() { this.leased = false; },
    async failAdvance() {
      this.current = { ...this.current, status: "failed" };
      this.leased = false;
      return true;
    },
    async listWorkerAdvanceableRuns() { return []; },
    async listRunTasks() { return this.tasks; },
    async listVerifiedQuotes() { return this.quotes; },
    async getLatestApprovedProposal() { return null; },
    async materializeApprovedProposal() { throw new Error("not reached"); },
    async publishSharedResult() { throw new Error("not reached"); },
    async saveProposal() {},
    async reviewProposal() {},
    async markRunFailed() { this.current = { ...this.current, status: "failed" }; },
  };
  return value;
}

describe("RunOrchestrator", () => {
  beforeEach(() => {
    vi.mocked(createAgentModel).mockReset();
    vi.mocked(createAgentModel).mockReturnValue(null);
  });

  it("allows only the explicit pending-to-collecting transition", async () => {
    const store = repository({ current: run("pending") });
    const status = await new RunOrchestrator({ repository: store, query: { execute: async () => ({ status: "empty" }) } }).advanceRun("run-1");
    expect(status).toBe("collecting");
    expect(store.transitions).toEqual([["pending", "collecting"]]);
  });

  it("fails an expired active run before acquiring a lease", async () => {
    const store = repository({
      current: { ...run("collecting"), staleAfter: "2026-08-01T00:00:00.000Z" },
    });
    const expire = vi.fn(async () => {
      store.current = { ...store.current, status: "failed", staleAfter: null };
      return true;
    });
    store.expireStaleRun = expire;

    await expect(new RunOrchestrator({
      repository: store,
      now: () => new Date("2026-08-01T00:00:01.000Z"),
    }).advanceRun("run-1")).resolves.toBe("failed");

    expect(expire).toHaveBeenCalledWith(
      "run-1", "collecting", "2026-08-01T00:00:01.000Z",
    );
    expect(store.leased).toBe(false);
  });

  it("executes at most one bounded query batch while collecting", async () => {
    const store = repository({ current: run("collecting"), tasks: [task(), task({ id: "task-2", participantId: "p2" })] });
    const executed: string[] = [];
    const status = await new RunOrchestrator({
      repository: store,
      logicalConcurrency: 1,
      query: { execute: async (id) => { executed.push(id); return { status: "empty" }; } },
    }).advanceRun("run-1");
    expect(status).toBe("collecting");
    expect(executed).toEqual(["task-1"]);
    expect(store.transitions).toEqual([]);
  });

  it("uses an explicitly configured secondary capability for eligible recovery", async () => {
    const store = repository({
      current: run("collecting"),
      tasks: [task({
        status: "retryable_failure",
        attemptCount: 1,
        errorCode: "PROVIDER_UNAVAILABLE",
      })],
    });
    const primary = vi.fn(async () => ({ status: "empty" as const }));
    const secondary = vi.fn(async () => ({ status: "empty" as const }));

    await new RunOrchestrator({
      repository: store,
      query: { execute: primary },
      secondaryQuery: { configured: true, execute: secondary },
    }).advanceRun("run-1");

    expect(secondary).toHaveBeenCalledWith("task-1");
    expect(primary).not.toHaveBeenCalled();
  });

  it("reports cooldown progress without bypassing its retry time", async () => {
    const retryAt = "2030-01-01T00:00:00.000Z";
    const store = repository({
      current: { ...run("collecting"), retryAfter: retryAt, staleAfter: retryAt },
      tasks: [task({ status: "retryable_failure", retryAfter: retryAt })],
    });
    const status = await new RunOrchestrator({
      repository: store, now: () => new Date("2029-12-31T23:59:59.000Z"), query: { execute: async () => ({ status: "empty" }) },
    }).advanceRun("run-1");
    expect(status).toBe("cooling_down");
    expect(store.transitions).toEqual([["collecting", "cooling_down"]]);
  });

  it("moves exhausted incomplete coverage to incomplete instead of publishing a partial result", async () => {
    const store = repository({ current: run("collecting"), tasks: [
      task({ status: "empty", attemptCount: 2 }), task({ id: "task-2", participantId: "p2", status: "succeeded" }),
    ] });
    const status = await new RunOrchestrator({ repository: store, query: { execute: async () => ({ status: "empty" }) } }).advanceRun("run-1");
    expect(status).toBe("incomplete");
    expect(store.transitions).toEqual([["collecting", "incomplete"]]);
  });

  it("terminalizes one exhausted route and continues other pending work", async () => {
    const store = repository({ current: run("collecting"), tasks: [
      task({
        id: "exhausted",
        status: "retryable_failure",
        attemptCount: 3,
        retryAfter: null,
        errorCode: "PROVIDER_TIMEOUT",
      }),
      task({ id: "pending", participantId: "p2", status: "pending" }),
    ] });
    const terminalize = vi.fn(async () => true);
    const execute = vi.fn(async () => ({ status: "empty" }));
    store.markTaskRecoveryExhausted = terminalize;

    const status = await new RunOrchestrator({ repository: store, query: { execute } }).advanceRun("run-1");

    expect(status).toBe("collecting");
    expect(terminalize).toHaveBeenCalledWith(
      "exhausted",
      "PROVIDER_TIMEOUT",
      expect.any(String),
    );
    expect(execute).toHaveBeenCalledWith("pending");
    expect(store.transitions).toEqual([]);
  });

  it("becomes incomplete only after every remaining route is terminal", async () => {
    const store = repository({ current: run("collecting"), tasks: [
      task({
        id: "exhausted",
        status: "retryable_failure",
        attemptCount: 3,
        retryAfter: null,
        errorCode: "PROVIDER_TIMEOUT",
      }),
    ] });
    store.markTaskRecoveryExhausted = vi.fn(async () => true);
    const execute = vi.fn(async () => ({ status: "empty" as const }));

    await expect(new RunOrchestrator({ repository: store, query: { execute } })
      .advanceRun("run-1")).resolves.toBe("incomplete");
    expect(store.markTaskRecoveryExhausted).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it("starts calculation when at least one candidate has complete real coverage", async () => {
    const store = repository({ current: run("collecting"), tasks: [
      task({ id: "wuhan-p1", participantId: "p1", cityCode: "wuhan", status: "succeeded" }),
      task({ id: "wuhan-p2", participantId: "p2", cityCode: "wuhan", status: "succeeded" }),
      task({ id: "beijing-p1", participantId: "p1", cityCode: "beijing", status: "succeeded" }),
      task({ id: "beijing-p2", participantId: "p2", cityCode: "beijing", status: "empty" }),
    ], quotes: [
      quote("p1", "wuhan"), quote("p2", "wuhan"), quote("p1", "beijing"),
    ] });

    const status = await new RunOrchestrator({
      repository: store,
      query: { execute: async () => ({ status: "empty" }) },
    }).advanceRun("run-1");

    expect(status).toBe("calculating");
    expect(store.transitions).toEqual([["collecting", "calculating"]]);
  });

  it("returns the current state when a concurrent request already moved it", async () => {
    const store = repository({ current: run("collecting") });
    store.compareAndSetRunStatus = async () => false;
    const status = await new RunOrchestrator({ repository: store, query: { execute: async () => ({ status: "empty" }) } }).advanceRun("run-1");
    expect(status).toBe("collecting");
  });

  it("does not duplicate a query batch while another advance request owns the run", async () => {
    const store = repository({ current: run("collecting"), tasks: [task()] });
    const executed: string[] = [];
    let release!: () => void;
    const queryStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const orchestrator = new RunOrchestrator({
      repository: store,
      query: {
        execute: async (taskId) => {
          executed.push(taskId);
          markStarted();
          await queryStarted;
          return { status: "empty" };
        },
      },
    });

    const first = orchestrator.advanceRun("run-1");
    await started;
    const second = orchestrator.advanceRun("run-1");
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(executed).toEqual(["task-1"]);
    release();
    await expect(Promise.all([first, second])).resolves.toEqual(["collecting", "collecting"]);
  });

  it("marks unexpected query failures as failed instead of leaving a retryable active run", async () => {
    const store = repository({ current: run("collecting"), tasks: [task()] });
    const error = new Error("network exploded");
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(new RunOrchestrator({
      repository: store,
      query: { execute: async () => { throw error; } },
    }).advanceRun("run-1")).resolves.toBe("failed");

    expect(store.current.status).toBe("failed");
    expect(log).toHaveBeenCalledWith(
      "[recommendation-run] advance failed",
      expect.objectContaining({
        runId: "run-1",
        traceId: "11111111-1111-4111-8111-111111111111",
        status: "collecting",
        error,
      }),
    );
    log.mockRestore();
  });

  it("marks repeated MODEL_INVALID_OUTPUT as AGENT_PROPOSAL_INVALID instead of RUN_ADVANCE_FAILED", async () => {
    const store = repository({
      current: run("calculating"),
      tasks: [
        task({ id: "wuhan-p1", participantId: "p1", cityCode: "wuhan", status: "succeeded" }),
        task({ id: "wuhan-p2", participantId: "p2", cityCode: "wuhan", status: "succeeded" }),
      ],
      quotes: [quote("p1", "wuhan"), quote("p2", "wuhan")],
    });
    const markRunFailed = vi.fn(async (_runId: string, errorCode: string) => {
      store.current = { ...store.current, status: "failed", errorCode };
    });
    const failAdvance = vi.fn(async () => {
      store.current = { ...store.current, status: "failed", errorCode: "RUN_ADVANCE_FAILED" };
      return true;
    });
    store.markRunFailed = markRunFailed;
    store.failAdvance = failAdvance;
    vi.mocked(createAgentModel).mockReturnValue({
      provider: "fake",
      model: "fake-model",
      generate: async () => {
        throw new AgentModelError("MODEL_INVALID_OUTPUT");
      },
    });

    await expect(new RunOrchestrator({ repository: store }).advanceRun("run-1"))
      .resolves.toBe("failed");

    expect(markRunFailed).toHaveBeenCalledWith("run-1", "AGENT_PROPOSAL_INVALID");
    expect(failAdvance).not.toHaveBeenCalled();
    expect(store.current.errorCode).toBe("AGENT_PROPOSAL_INVALID");
  });

  it("continues the bounded calculation loop after a transient MODEL_INVALID_OUTPUT", async () => {
    const store = repository({
      current: run("calculating"),
      tasks: [
        task({ id: "wuhan-p1", participantId: "p1", cityCode: "wuhan", status: "succeeded" }),
        task({ id: "wuhan-p2", participantId: "p2", cityCode: "wuhan", status: "succeeded" }),
      ],
      quotes: [quote("p1", "wuhan"), quote("p2", "wuhan")],
    });
    const failAdvance = vi.fn(async () => {
      store.current = { ...store.current, status: "failed", errorCode: "RUN_ADVANCE_FAILED" };
      return true;
    });
    store.failAdvance = failAdvance;
    let calculationCalls = 0;
    const proposal = {
      status: "proposal" as const,
      cityCode: "wuhan",
      schemes: [
        {
          kind: "saving" as const,
          quoteIdsByParticipant: {
            p1: `flyai:${"a".repeat(64)}`,
            p2: `flyai:${"a".repeat(64)}`,
          },
          totalFareCny: 200,
        },
        {
          kind: "fast" as const,
          quoteIdsByParticipant: {
            p1: `flyai:${"a".repeat(64)}`,
            p2: `flyai:${"a".repeat(64)}`,
          },
          totalFareCny: 200,
        },
      ],
      comparisonEvidence: {
        eligibleCityCodes: ["wuhan"],
        orderedCityCodes: ["wuhan"],
      },
      explanationZh: "这座城市按真实票价和统一规则为全员选出，每一程都有据可查。",
    };
    vi.mocked(createAgentModel).mockReturnValue({
      provider: "fake",
      model: "deepseek-v4-flash",
      generate: async (request) => {
        if (request.agent === "calculation") {
          calculationCalls += 1;
          if (calculationCalls === 1) {
            throw new AgentModelError("MODEL_INVALID_OUTPUT");
          }
          return request.outputSchema.parse(proposal);
        }
        return request.outputSchema.parse({ decision: "approve" });
      },
    });

    await expect(new RunOrchestrator({ repository: store }).advanceRun("run-1"))
      .resolves.toBe("validating");

    expect(calculationCalls).toBe(2);
    expect(failAdvance).not.toHaveBeenCalled();
    expect(store.transitions).toEqual([["calculating", "validating"]]);
  });

  it("materializes an approved alternative privately without calling automatic publication", async () => {
    const current = { ...run("validating"), kind: "alternative" as const };
    const store = repository({ current, quotes: [quote("p1", "wuhan"), quote("p2", "wuhan")] });
    const listVerifiedQuotes = vi.fn(async () => store.quotes);
    const materialize = vi.fn(async () => "55555555-5555-4555-8555-555555555555");
    const publish = vi.fn(async () => undefined);
    store.listVerifiedQuotes = listVerifiedQuotes;
    store.getLatestApprovedProposal = async () => ({
      id: "proposal-1",
      version: 1,
      output: {
        status: "proposal",
        cityCode: "wuhan",
        schemes: [
          { kind: "saving", quoteIdsByParticipant: { p1: `flyai:${"a".repeat(64)}`, p2: `flyai:${"a".repeat(64)}` }, totalFareCny: 200 },
          { kind: "fast", quoteIdsByParticipant: { p1: `flyai:${"a".repeat(64)}`, p2: `flyai:${"a".repeat(64)}` }, totalFareCny: 200 },
        ],
        comparisonEvidence: { eligibleCityCodes: ["wuhan"], orderedCityCodes: ["wuhan"] },
        explanationZh: "已核验。",
      },
    });
    store.materializeApprovedProposal = materialize;
    store.publishSharedResult = publish;

    await expect(new RunOrchestrator({ repository: store }).advanceRun("run-1"))
      .resolves.toBe("awaiting_host_confirmation");
    expect(listVerifiedQuotes).not.toHaveBeenCalled();
    expect(materialize).toHaveBeenCalledWith("run-1", "proposal-1");
    expect(publish).not.toHaveBeenCalled();
  });
});
