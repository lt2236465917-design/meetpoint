import { describe, expect, it, vi } from "vitest";

import type { RunOrchestratorRepository, StoredRun } from "@/lib/agent/run-orchestrator";
import { RunOrchestrator } from "@/lib/agent/run-orchestrator";
import type { VerifiedQuote } from "@/lib/agent/contracts";
import type { StoredRouteTask } from "@/lib/recommendation/repository";

function run(status: StoredRun["status"]): StoredRun {
  return {
    id: "run-1", planId: "plan-1", status, traceId: "11111111-1111-4111-8111-111111111111",
    retryAfter: null, errorCode: null, policyVersion: "2026-07-15.v1", kind: "automatic",
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
  it("allows only the explicit pending-to-collecting transition", async () => {
    const store = repository({ current: run("pending") });
    const status = await new RunOrchestrator({ repository: store, query: { execute: async () => ({ status: "empty" }) } }).advanceRun("run-1");
    expect(status).toBe("collecting");
    expect(store.transitions).toEqual([["pending", "collecting"]]);
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

  it("reports cooldown progress without bypassing its retry time", async () => {
    const retryAt = "2030-01-01T00:00:00.000Z";
    const store = repository({ current: { ...run("collecting"), retryAfter: retryAt }, tasks: [task({ status: "retryable_failure", retryAfter: retryAt })] });
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

  it("stops only the exhausted retryable route group after its two allowed recovery attempts", async () => {
    const store = repository({ current: run("collecting"), tasks: [
      task({
        status: "retryable_failure",
        attemptCount: 3,
        retryAfter: null,
        errorCode: "PROVIDER_TIMEOUT",
      }),
      task({ id: "task-2", participantId: "p2", status: "succeeded" }),
    ] });
    const execute = vi.fn(async () => ({ status: "empty" }));

    const status = await new RunOrchestrator({ repository: store, query: { execute } }).advanceRun("run-1");

    expect(status).toBe("incomplete");
    expect(execute).not.toHaveBeenCalled();
    expect(store.transitions).toEqual([["collecting", "incomplete"]]);
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

    await expect(new RunOrchestrator({
      repository: store,
      query: { execute: async () => { throw new Error("network exploded"); } },
    }).advanceRun("run-1")).resolves.toBe("failed");

    expect(store.current.status).toBe("failed");
  });

  it("materializes an approved alternative privately without calling automatic publication", async () => {
    const current = { ...run("validating"), kind: "alternative" as const };
    const store = repository({ current, quotes: [quote("p1", "wuhan"), quote("p2", "wuhan")] });
    const materialize = vi.fn(async () => undefined);
    const publish = vi.fn(async () => undefined);
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
    expect(materialize).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
  });
});
