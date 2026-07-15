import { beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  insert: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabaseClient: () => ({ from: persistence.from }),
}));

import { recordAgentEvent } from "@/lib/agent/trace";

describe("recordAgentEvent", () => {
  beforeEach(() => {
    persistence.insert.mockReset().mockResolvedValue({ error: null });
    persistence.from.mockReset().mockReturnValue({ insert: persistence.insert });
  });

  it("persists only allowlisted trace fields", async () => {
    await recordAgentEvent({
      runId: "00000000-0000-4000-8000-000000000010",
      traceId: "00000000-0000-4000-8000-000000000011",
      agent: "calculation",
      eventType: "proposal_validated",
      status: "completed",
      durationMs: 37,
      model: "deepseek-v4-flash",
      taskId: "00000000-0000-4000-8000-000000000012",
      proposalId: "00000000-0000-4000-8000-000000000013",
      validationCodes: ["QUOTE_SET_COMPLETE"],
      counts: { participantCount: 2, quoteCount: 8 },
      system: "raw-system-prompt",
      input: { prompt: "raw-input-prompt" },
      messages: [{ role: "user", content: "raw-message-prompt" }],
      authorization: "Bearer auth-value",
      token: "participant-token",
      secret: "server-secret",
      bookingUrl: "https://supplier.example/book/secret",
      rawPayload: { provider: "raw-provider-payload" },
      participant: { name: "敏感姓名" },
      env: { DEEPSEEK_API_KEY: "environment-secret" },
    });

    expect(persistence.from).toHaveBeenCalledWith("agent_events");
    expect(persistence.insert).toHaveBeenCalledWith({
      run_id: "00000000-0000-4000-8000-000000000010",
      trace_id: "00000000-0000-4000-8000-000000000011",
      agent_name: "calculation",
      event_type: "proposal_validated",
      payload: {
        status: "completed",
        durationMs: 37,
        model: "deepseek-v4-flash",
        taskId: "00000000-0000-4000-8000-000000000012",
        proposalId: "00000000-0000-4000-8000-000000000013",
        validationCodes: ["QUOTE_SET_COMPLETE"],
        counts: { participantCount: 2, quoteCount: 8 },
      },
    });

    const persisted = JSON.stringify(persistence.insert.mock.calls[0]);
    for (const forbidden of [
      "raw-system-prompt",
      "raw-input-prompt",
      "raw-message-prompt",
      "auth-value",
      "participant-token",
      "server-secret",
      "bookingUrl",
      "raw-provider-payload",
      "敏感姓名",
      "environment-secret",
    ]) {
      expect(persisted).not.toContain(forbidden);
    }
  });

  it("does not allow sensitive keys to hide inside counts", async () => {
    await recordAgentEvent({
      runId: "00000000-0000-4000-8000-000000000020",
      traceId: "00000000-0000-4000-8000-000000000021",
      agent: "supervisor",
      eventType: "validation_finished",
      counts: {
        quoteCount: 3,
        token: 1,
        bookingUrl: 1,
        participantName: 1,
        rawPayload: 1,
      },
    });

    expect(persistence.insert).toHaveBeenCalledWith(expect.objectContaining({
      payload: { counts: { quoteCount: 3 } },
    }));
  });

  it.each([
    ["agent", { agent: "raw participant name" }],
    ["event type", { eventType: "raw prompt with token" }],
    ["status", { status: "completed with secret" }],
    ["run ID", { runId: "participant-name" }],
    ["trace ID", { traceId: "authorization-token" }],
    ["task ID", { taskId: "敏感姓名" }],
    ["proposal ID", { proposalId: "https://supplier.example/bookingUrl" }],
    ["model", { model: "raw prompt containing secret token" }],
    ["model URL", { model: "https://provider.example/model" }],
    ["model token shape", { model: "sk-live-credential" }],
    ["non-string task ID", {
      taskId: {
        toString: () => "00000000-0000-4000-8000-000000000032",
      },
    }],
  ])("rejects unsafe free text in the allowlisted %s field", async (_label, override) => {
    const event = {
      runId: "00000000-0000-4000-8000-000000000030",
      traceId: "00000000-0000-4000-8000-000000000031",
      agent: "manager",
      eventType: "proposal_validated",
      status: "completed",
      model: "deepseek-v4-flash",
      taskId: "00000000-0000-4000-8000-000000000032",
      proposalId: "00000000-0000-4000-8000-000000000033",
      ...override,
    };

    const error = await recordAgentEvent(event as never).catch(
      (caught: unknown) => caught,
    );

    expect(error).toEqual(new Error("Invalid agent event"));
    expect(persistence.insert).not.toHaveBeenCalled();
  });

  it("drops sensitive validation codes rather than persisting their values", async () => {
    await recordAgentEvent({
      runId: "00000000-0000-4000-8000-000000000040",
      traceId: "00000000-0000-4000-8000-000000000041",
      agent: "supervisor",
      eventType: "validation_finished",
      validationCodes: ["QUOTE_SET_COMPLETE", "SECRET_TOKEN_VALUE"],
    });

    expect(persistence.insert).toHaveBeenCalledWith(expect.objectContaining({
      payload: { validationCodes: ["QUOTE_SET_COMPLETE"] },
    }));
  });
});
