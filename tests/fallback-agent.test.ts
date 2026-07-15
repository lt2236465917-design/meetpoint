import { describe, expect, it } from "vitest";

import { FallbackAgent } from "@/lib/agent/fallback-agent";

describe("FallbackAgent", () => {
  const now = new Date("2026-07-15T10:00:00.000Z");

  it("never immediately retries a rate-limited task", () => {
    const action = new FallbackAgent({ now: () => now }).decide({
      taskId: "t1",
      errorCode: "PROVIDER_RATE_LIMITED",
      retryAfter: "2026-07-15T10:01:00.000Z",
      recoveryAttemptCount: 0,
      secondaryAdapterConfigured: true,
    });
    expect(action).toEqual({ type: "wait_until", taskId: "t1", retryAt: "2026-07-15T10:01:00.000Z" });
  });

  it("reruns a rate-limited task after cooldown when recovery remains", () => {
    const action = new FallbackAgent({ now: () => now }).decide({
      taskId: "t1",
      errorCode: "PROVIDER_RATE_LIMITED",
      retryAfter: "2026-07-15T09:59:00.000Z",
      recoveryAttemptCount: 1,
      secondaryAdapterConfigured: false,
    });
    expect(action).toEqual({ type: "rerun_task", taskId: "t1" });
  });

  it("caps recovery at two attempts per task and marks exhausted coverage incomplete", () => {
    const agent = new FallbackAgent({ now: () => now });
    expect(agent.decide({
      taskId: "t1", errorCode: "PROVIDER_TIMEOUT", retryAfter: null,
      recoveryAttemptCount: 1, secondaryAdapterConfigured: false,
    })).toEqual({ type: "rerun_task", taskId: "t1" });
    expect(agent.decide({
      taskId: "t1", errorCode: "PROVIDER_TIMEOUT", retryAfter: null,
      recoveryAttemptCount: 2, secondaryAdapterConfigured: false,
    })).toEqual({ type: "stop_incomplete", taskId: "t1", runStatus: "incomplete" });
  });

  it("does not select an absent secondary adapter", () => {
    expect(new FallbackAgent({ now: () => now }).decide({
      taskId: "t1", errorCode: "PROVIDER_UNAVAILABLE", retryAfter: null,
      recoveryAttemptCount: 0, secondaryAdapterConfigured: false,
    }).type).not.toBe("try_configured_adapter");
  });

  it("selects only an explicitly configured secondary adapter", () => {
    expect(new FallbackAgent({ now: () => now }).decide({
      taskId: "t1", errorCode: "PROVIDER_UNAVAILABLE", retryAfter: null,
      recoveryAttemptCount: 0, secondaryAdapterConfigured: true,
    })).toEqual({ type: "try_configured_adapter", taskId: "t1" });
  });
});
