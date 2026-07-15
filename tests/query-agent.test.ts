import { describe, expect, it, vi } from "vitest";

import { QueryAgent, createPhysicalTicketScheduler } from "@/lib/agent/query-agent";
import { GatewayClientError } from "@/lib/travel/gateway-client";
import type { RecommendationRepository, StoredRouteTask } from "@/lib/recommendation/repository";

const quoteId = `flyai:${"a".repeat(64)}`;

function task(id: string, participantId: string): StoredRouteTask {
  return {
    id,
    runId: "run-1",
    participantId,
    cityCode: "wuhan",
    originCityCode: "beijing",
    mode: "flight",
    searchDate: "2026-08-14",
    arrivalDate: "2026-08-15",
    physicalKey: "beijing:wuhan:flight:2026-08-14",
    status: "pending",
    attemptCount: 0,
    retryAfter: null,
    errorCode: null,
  };
}

function queryRepository(tasks: StoredRouteTask[]) {
  const stored = new Map(tasks.map((value) => [value.id, value]));
  const outcomes: Array<{ taskId: string; outcome: unknown }> = [];
  const statuses: Array<{ runId: string; status: string }> = [];
  const repository: RecommendationRepository = {
    async createRunMatrix() { throw new Error("not used"); },
    async getRouteTask(id) { return stored.get(id) ?? null; },
    async markTaskRunning(id) {
      const current = stored.get(id)!;
      const running = { ...current, status: "running" as const, attemptCount: current.attemptCount + 1 };
      stored.set(id, running);
      return running;
    },
    async saveTaskOutcome(taskId, outcome) { outcomes.push({ taskId, outcome }); },
    async updateRunStatus(runId, status) { statuses.push({ runId, status }); },
  };
  return { repository, outcomes, statuses };
}

const result = {
  queriedAt: "2026-07-15T10:00:00+08:00",
  traceId: "11111111-1111-4111-8111-111111111111",
  cache: "miss" as const,
  options: [{
    quoteId,
    providerQuoteId: null,
    mode: "flight" as const,
    source: "real" as const,
    provider: "flyai" as const,
    priceCny: 500,
    departAt: "2026-08-14T10:00:00+08:00",
    arriveAt: "2026-08-15T00:30:00+08:00",
    durationMinutes: 870,
    isDirect: true,
    hasTransfer: false,
    transferCount: 0,
    serviceName: "MU1234",
    departureStationName: "北京首都机场",
    arrivalStationName: "武汉天河机场",
    bookingUrl: null,
  }],
};

describe("QueryAgent", () => {
  it("coalesces the same physical lookup and fans verified facts into participant rows", async () => {
    const repository = queryRepository([task("t1", "p1"), task("t2", "p2")]);
    const ticketTool = vi.fn(async () => result);
    const agent = new QueryAgent(repository.repository, ticketTool, createPhysicalTicketScheduler());

    const [first, second] = await Promise.all([agent.execute("t1"), agent.execute("t2")]);

    expect(ticketTool).toHaveBeenCalledTimes(1);
    expect(ticketTool.mock.calls[0]?.[0]).toEqual({
      originCityCode: "beijing",
      originCityName: "北京",
      destinationCityCode: "wuhan",
      destinationCityName: "武汉",
      departureDate: "2026-08-14",
      mode: "flight",
    });
    expect(ticketTool.mock.calls[0]?.[0]).not.toHaveProperty("participantId");
    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
    if (first.status === "success" && second.status === "success") {
      expect(first.quotes[0]).toEqual(expect.objectContaining({ participantId: "p1", quoteId }));
      expect(second.quotes[0]).toEqual(expect.objectContaining({ participantId: "p2", quoteId }));
    }
    expect(repository.outcomes).toHaveLength(2);
  });

  it("turns gateway rate limits into cooldown state without an immediate retry", async () => {
    const repository = queryRepository([task("t1", "p1")]);
    const ticketTool = vi.fn(async () => {
      throw new GatewayClientError("PROVIDER_RATE_LIMITED", null, 4_000);
    });
    const agent = new QueryAgent(repository.repository, ticketTool, createPhysicalTicketScheduler());

    await expect(agent.execute("t1")).resolves.toEqual({
      status: "retryable_failure",
      code: "PROVIDER_RATE_LIMITED",
      retryAfterMs: 4_000,
    });
    expect(ticketTool).toHaveBeenCalledTimes(1);
    expect(repository.statuses).toContainEqual({ runId: "run-1", status: "cooling_down" });
  });

  it("filters quotes that arrive outside the stored Shanghai arrival date", async () => {
    const repository = queryRepository([task("t1", "p1")]);
    const ticketTool = vi.fn(async () => ({
      ...result,
      options: [{ ...result.options[0], arriveAt: "2026-08-16T00:30:00+08:00" }],
    }));
    const agent = new QueryAgent(repository.repository, ticketTool, createPhysicalTicketScheduler());

    await expect(agent.execute("t1")).resolves.toEqual({ status: "empty" });
    expect(repository.outcomes).toEqual([{ taskId: "t1", outcome: { status: "empty" } }]);
  });

  it("treats provider CLI failures as terminal", async () => {
    const repository = queryRepository([task("t1", "p1")]);
    const ticketTool = vi.fn(async () => {
      throw new GatewayClientError("PROVIDER_CLI_FAILED");
    });
    const agent = new QueryAgent(repository.repository, ticketTool, createPhysicalTicketScheduler());

    await expect(agent.execute("t1")).resolves.toEqual({
      status: "terminal_failure",
      code: "PROVIDER_CLI_FAILED",
    });
  });

  it("rejects evidence whose mode does not match the stored task", async () => {
    const repository = queryRepository([task("t1", "p1")]);
    const ticketTool = vi.fn(async () => ({
      ...result,
      options: [{ ...result.options[0], mode: "high_speed_rail" as const }],
    }));
    const agent = new QueryAgent(repository.repository, ticketTool, createPhysicalTicketScheduler());

    await expect(agent.execute("t1")).resolves.toEqual({
      status: "terminal_failure",
      code: "GATEWAY_EVIDENCE_MISMATCH",
    });
  });

  it("keeps different physical gateway calls serial", async () => {
    const secondTask = { ...task("t2", "p2"), physicalKey: "beijing:wuhan:flight:2026-08-15", searchDate: "2026-08-15" };
    const repository = queryRepository([task("t1", "p1"), secondTask]);
    let active = 0;
    let maximum = 0;
    const ticketTool = vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return result;
    });
    const agent = new QueryAgent(repository.repository, ticketTool, createPhysicalTicketScheduler());

    await Promise.all([agent.execute("t1"), agent.execute("t2")]);
    expect(ticketTool).toHaveBeenCalledTimes(2);
    expect(maximum).toBe(1);
  });
});
