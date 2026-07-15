import { describe, expect, it } from "vitest";

import type { RunOrchestratorRepository, StoredRun } from "@/lib/agent/run-orchestrator";
import { RunOrchestrator } from "@/lib/agent/run-orchestrator";
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

function repository(input: { current: StoredRun; tasks?: StoredRouteTask[] }): RunOrchestratorRepository & {
  transitions: Array<[string, string]>;
} {
  const value = {
    current: input.current,
    tasks: input.tasks ?? [],
    transitions: [] as Array<[string, string]>,
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
    async listRunTasks() { return this.tasks; },
    async listVerifiedQuotes() { return []; },
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

  it("returns the current state when a concurrent request already moved it", async () => {
    const store = repository({ current: run("collecting") });
    store.compareAndSetRunStatus = async () => false;
    const status = await new RunOrchestrator({ repository: store, query: { execute: async () => ({ status: "empty" }) } }).advanceRun("run-1");
    expect(status).toBe("collecting");
  });
});
