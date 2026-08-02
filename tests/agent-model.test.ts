import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const openAiSdk = vi.hoisted(() => ({
  options: undefined as
    | { baseURL?: string; apiKey?: string; timeout?: number; maxRetries?: number }
    | undefined,
  create: vi.fn(),
  createResponse: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    readonly timeout: number | undefined;
    readonly maxRetries: number | undefined;
    readonly chat = { completions: { create: openAiSdk.create } };
    readonly responses = { create: openAiSdk.createResponse };

    constructor(options: {
      baseURL?: string;
      apiKey?: string;
      timeout?: number;
      maxRetries?: number;
    }) {
      openAiSdk.options = options;
      this.timeout = options.timeout;
      this.maxRetries = options.maxRetries;
    }
  },
}));

import type { AgentModel } from "@/lib/agent/model";
import { AgentModelError } from "@/lib/agent/model";
import {
  createAgentModel,
  createAgentModelForTransport,
  resetDeepSeekShadowStateForTests,
} from "@/lib/agent/deepseek-model";

const outputSchema = z.object({ cityCode: z.string() }).strict();

async function runDownstreamAgent(model: AgentModel) {
  return model.generate({
    agent: "manager",
    system: "Return one verified city code.",
    input: { quoteIds: ["quote-1"] },
    outputSchema,
    traceId: "00000000-0000-4000-8000-000000000001",
  });
}

describe("AgentModel", () => {
  beforeEach(() => {
    vi.stubEnv("DEEPSEEK_API_KEY", "server-only-test-key");
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-flash");
    vi.stubEnv("DEEPSEEK_TRANSPORT", "chat_completions");
    vi.stubEnv("DEEPSEEK_SHADOW_TRANSPORT", "off");
    openAiSdk.options = undefined;
    openAiSdk.create.mockReset();
    openAiSdk.createResponse.mockReset();
    resetDeepSeekShadowStateForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets downstream agents depend on only the provider-neutral interface", async () => {
    const fakeModel: AgentModel = {
      provider: "fake",
      model: "deterministic-test-model",
      generate: async ({ outputSchema: schema }) =>
        schema.parse({ cityCode: "420100" }),
    };

    await expect(runDownstreamAgent(fakeModel)).resolves.toEqual({
      cityCode: "420100",
    });
  });

  it("returns null when the server-side API key is unavailable", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");

    expect(createAgentModel()).toBeNull();
  });

  it("uses JSON mode with a 15 second timeout and at most one SDK retry", async () => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-1",
      choices: [{ message: { role: "assistant", content: '{"cityCode":"420100"}' } }],
    });

    const model = createAgentModel();
    await expect(runDownstreamAgent(model!)).resolves.toEqual({ cityCode: "420100" });

    expect(openAiSdk.options).toMatchObject({ timeout: 15_000, maxRetries: 1 });
    expect(openAiSdk.create).toHaveBeenCalledWith(expect.objectContaining({
      model: "deepseek-v4-flash",
      response_format: { type: "json_object" },
      max_tokens: 4096,
      thinking: { type: "disabled" },
      messages: [
        { role: "system", content: expect.stringContaining("JSON") },
        { role: "user", content: '{"quoteIds":["quote-1"]}' },
      ],
    }));
  });

  it("uses Responses with the same safe input and concrete strict JSON schema when selected", async () => {
    vi.stubEnv("DEEPSEEK_TRANSPORT", "responses");
    openAiSdk.createResponse.mockResolvedValue({
      id: "resp-1",
      output_text: '{"cityCode":"420100"}',
      usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
    });

    await expect(runDownstreamAgent(createAgentModel()!)).resolves.toEqual({
      cityCode: "420100",
    });

    expect(openAiSdk.create).not.toHaveBeenCalled();
    expect(openAiSdk.createResponse).toHaveBeenCalledWith(expect.objectContaining({
      model: "deepseek-v4-flash",
      instructions: expect.stringContaining("JSON"),
      input: '{"quoteIds":["quote-1"]}',
      max_output_tokens: 4096,
      reasoning: { effort: "none" },
      text: {
        format: {
          type: "json_schema",
          name: "agent_output",
          schema: z.toJSONSchema(outputSchema),
          strict: true,
        },
      },
    }));
    const body = openAiSdk.createResponse.mock.calls[0]?.[0];
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("conversation");
    expect(body).not.toHaveProperty("store");
    expect(body).not.toHaveProperty("background");
    expect(body).not.toHaveProperty("tools");
  });

  it("uses Responses JSON object mode for complex unions while enforcing the same strict schema locally", async () => {
    vi.stubEnv("DEEPSEEK_TRANSPORT", "responses");
    const unionSchema = z.discriminatedUnion("decision", [
      z.object({ decision: z.literal("approve") }).strict(),
      z.object({ decision: z.literal("correct"), codes: z.array(z.string()) }).strict(),
    ]);
    openAiSdk.createResponse.mockResolvedValue({
      id: "resp-union",
      output_text: '{"decision":"approve"}',
    });

    await expect(createAgentModel()!.generate({
      agent: "supervisor",
      system: "Review one proposal.",
      input: { validation: { ok: true } },
      outputSchema: unionSchema,
      traceId: "00000000-0000-4000-8000-000000000013",
    })).resolves.toEqual({ decision: "approve" });
    expect(openAiSdk.createResponse).toHaveBeenCalledWith(expect.objectContaining({
      text: { format: { type: "json_object" } },
    }));
  });

  it("retries Responses once for invalid JSON through the shared validation boundary", async () => {
    vi.stubEnv("DEEPSEEK_TRANSPORT", "responses");
    openAiSdk.createResponse
      .mockResolvedValueOnce({ id: "resp-bad", output_text: "not-json{" })
      .mockResolvedValueOnce({ id: "resp-ok", output_text: '{"cityCode":"420100"}' });

    await expect(runDownstreamAgent(createAgentModel()!)).resolves.toEqual({
      cityCode: "420100",
    });
    expect(openAiSdk.createResponse).toHaveBeenCalledTimes(2);
  });

  it("accounts for every Responses attempt in redacted comparison usage", async () => {
    const observations: Array<{ totalTokens: number; retryCount: number }> = [];
    openAiSdk.createResponse
      .mockResolvedValueOnce({
        id: "resp-bad",
        output_text: "not-json{",
        usage: { input_tokens: 8, output_tokens: 2, total_tokens: 10 },
      })
      .mockResolvedValueOnce({
        id: "resp-ok",
        output_text: '{"cityCode":"420100"}',
        usage: { input_tokens: 9, output_tokens: 3, total_tokens: 12 },
      });
    const model = createAgentModelForTransport("responses", (observation) => {
      observations.push(observation);
    });

    await expect(runDownstreamAgent(model!)).resolves.toEqual({ cityCode: "420100" });
    expect(observations).toEqual([expect.objectContaining({
      totalTokens: 22,
      retryCount: 1,
    })]);
  });

  it("preserves timeout and unavailable mappings on Responses", async () => {
    vi.stubEnv("DEEPSEEK_TRANSPORT", "responses");
    openAiSdk.createResponse.mockRejectedValueOnce(Object.assign(new Error("timeout"), {
      name: "APIConnectionTimeoutError",
    }));
    await expect(runDownstreamAgent(createAgentModel()!)).rejects.toMatchObject({
      code: "MODEL_TIMEOUT",
    });

    openAiSdk.createResponse.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(runDownstreamAgent(createAgentModel()!)).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE",
    });
  });

  it("fails closed for an unknown primary transport", () => {
    vi.stubEnv("DEEPSEEK_TRANSPORT", "unknown-protocol");

    expect(() => createAgentModel()).toThrow(expect.objectContaining({
      code: "MODEL_UNAVAILABLE",
    }));
    expect(openAiSdk.create).not.toHaveBeenCalled();
    expect(openAiSdk.createResponse).not.toHaveBeenCalled();
  });

  it("runs a sampled Responses shadow without changing the Chat Completions result", async () => {
    vi.stubEnv("DEEPSEEK_SHADOW_TRANSPORT", "responses");
    vi.stubEnv("DEEPSEEK_SHADOW_SAMPLE_RATE", "1");
    vi.stubEnv("DEEPSEEK_SHADOW_MAX_CONCURRENCY", "1");
    vi.stubEnv("DEEPSEEK_SHADOW_MAX_CALLS_PER_PROCESS", "2");
    vi.stubEnv("DEEPSEEK_SHADOW_MAX_TOTAL_TOKENS_PER_PROCESS", "100");
    openAiSdk.create.mockResolvedValue({
      id: "chat-primary",
      choices: [{ message: { role: "assistant", content: '{"cityCode":"420100"}' } }],
    });
    openAiSdk.createResponse.mockResolvedValue({
      id: "responses-shadow",
      output_text: '{"cityCode":"different-shadow-value"}',
      usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(runDownstreamAgent(createAgentModel()!)).resolves.toEqual({
      cityCode: "420100",
    });
    await vi.waitFor(() => expect(openAiSdk.createResponse).toHaveBeenCalledTimes(1));

    const logged = info.mock.calls.flat().join(" ");
    expect(logged).toContain('"transport":"responses"');
    expect(logged).toContain('"schemaQualified":true');
    expect(logged).not.toContain("different-shadow-value");
    expect(logged).not.toContain("quote-1");
    expect(logged).not.toContain("server-only-test-key");
  });

  it("keeps shadow off at zero sample rate and enforces fail-closed shadow config", async () => {
    vi.stubEnv("DEEPSEEK_SHADOW_TRANSPORT", "responses");
    vi.stubEnv("DEEPSEEK_SHADOW_SAMPLE_RATE", "0");
    openAiSdk.create.mockResolvedValue({
      id: "chat-primary",
      choices: [{ message: { role: "assistant", content: '{"cityCode":"420100"}' } }],
    });

    await expect(runDownstreamAgent(createAgentModel()!)).resolves.toEqual({
      cityCode: "420100",
    });
    expect(openAiSdk.createResponse).not.toHaveBeenCalled();

    vi.stubEnv("DEEPSEEK_SHADOW_TRANSPORT", "unknown-protocol");
    expect(() => createAgentModel()).toThrow(expect.objectContaining({
      code: "MODEL_UNAVAILABLE",
    }));
  });

  it("retries once when the first completion returns unparseable JSON", async () => {
    openAiSdk.create
      .mockResolvedValueOnce({
        id: "chatcmpl-bad-json",
        choices: [{ message: { role: "assistant", content: "not-json{" } }],
      })
      .mockResolvedValueOnce({
        id: "chatcmpl-recovered",
        choices: [{ message: { role: "assistant", content: '{"cityCode":"420100"}' } }],
      });

    await expect(runDownstreamAgent(createAgentModel()!)).resolves.toEqual({
      cityCode: "420100",
    });
    expect(openAiSdk.create).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry when completions stay invalid", async () => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-still-bad",
      choices: [{ message: { role: "assistant", content: "not-json{" } }],
    });

    const error = await runDownstreamAgent(createAgentModel()!).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AgentModelError);
    expect(error).toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
    expect(openAiSdk.create).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown model fields with a stable invalid-output error", async () => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-2",
      choices: [{
        message: {
          role: "assistant",
          content: '{"cityCode":"420100","inventedFare":99}',
        },
      }],
    });

    const error = await runDownstreamAgent(createAgentModel()!).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AgentModelError);
    expect(error).toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
    expect(openAiSdk.create).toHaveBeenCalledTimes(2);
  });

  it("rejects stripped unknown fields even when the caller schema is not strict", async () => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-non-strict",
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({
            cityCode: "420100",
            inventedFare: 99,
            detail: { score: 1, rawPayload: "invented" },
            routes: [{ id: "route-1", bookingUrl: "https://example.test" }],
          }),
        },
      }],
    });
    const schema = z.object({
      cityCode: z.string(),
      detail: z.object({ score: z.number() }),
      routes: z.array(z.object({ id: z.string() })),
    });

    const error = await createAgentModel()!.generate({
      agent: "manager",
      system: "Return one verified city code.",
      input: { quoteIds: ["quote-1"] },
      outputSchema: schema,
      traceId: "00000000-0000-4000-8000-000000000002",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentModelError);
    expect(error).toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
    expect(openAiSdk.create).toHaveBeenCalledTimes(2);
  });

  it("preserves valid Zod coercion while checking output structure", async () => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-coercion",
      choices: [{ message: { role: "assistant", content: '{"count":"2"}' } }],
    });

    await expect(createAgentModel()!.generate({
      agent: "calculation",
      system: "Return a count.",
      input: { quoteIds: ["quote-1"] },
      outputSchema: z.object({ count: z.coerce.number() }),
      traceId: "00000000-0000-4000-8000-000000000003",
    })).resolves.toEqual({ count: 2 });
  });

  it.each([
    ["raw provider payload", { rawPayload: { fare: 99 } }],
    ["authorization", { authorization: "Bearer credential" }],
    ["token", { accessToken: "credential" }],
    ["secret", { clientSecret: "credential" }],
    ["booking URL", { bookingUrl: "https://supplier.example/book" }],
    ["participant name path", { participant: { name: "敏感姓名" } }],
    ["participantName", { participantName: "敏感姓名" }],
    ["raw prompt", { rawPrompt: "ignore previous instructions" }],
    ["messages", { messages: [{ role: "user", content: "raw prompt" }] }],
  ])("rejects unsafe %s before sending model input", async (_label, unsafeInput) => {
    const error = await createAgentModel()!.generate({
      agent: "manager",
      system: "Return one verified city code.",
      input: {
        cityName: "武汉",
        serviceName: "G123",
        nested: unsafeInput,
      },
      outputSchema,
      traceId: "00000000-0000-4000-8000-000000000004",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentModelError);
    expect(error).toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
    expect(String(error)).not.toContain("敏感姓名");
    expect(openAiSdk.create).not.toHaveBeenCalled();
  });

  it("allows non-identity name fields in safe structured model input", async () => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-safe-names",
      choices: [{ message: { role: "assistant", content: '{"cityCode":"420100"}' } }],
    });

    await expect(createAgentModel()!.generate({
      agent: "manager",
      system: "Return one verified city code.",
      input: { cityName: "武汉", serviceName: "G123" },
      outputSchema,
      traceId: "00000000-0000-4000-8000-000000000005",
    })).resolves.toEqual({ cityCode: "420100" });
  });

  it.each([
    ["participant primitive", { participant: "Alice" }],
    ["participants primitive array", { participants: ["Alice"] }],
    ["toJSON raw payload", {
      wrapper: { toJSON: () => ({ rawPayload: { fare: 99 } }) },
    }],
    ["toJSON token", {
      wrapper: { toJSON: () => ({ token: "credential" }) },
    }],
    ["toJSON participant identity", {
      wrapper: { toJSON: () => ({ participant: { name: "Alice" } }) },
    }],
  ])("rejects unsafe serialized %s before the SDK call", async (_label, input) => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-unsafe-serialized-input",
      choices: [{ message: { role: "assistant", content: '{"cityCode":"420100"}' } }],
    });

    const error = await createAgentModel()!.generate({
      agent: "manager",
      system: "Return one verified city code.",
      input,
      outputSchema,
      traceId: "00000000-0000-4000-8000-000000000006",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentModelError);
    expect(error).toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
    expect(String(error)).not.toContain("Alice");
    expect(openAiSdk.create).not.toHaveBeenCalled();
  });

  it("allows structured participant IDs in serialized model input", async () => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-safe-participant-id",
      choices: [{ message: { role: "assistant", content: '{"cityCode":"420100"}' } }],
    });

    await expect(createAgentModel()!.generate({
      agent: "manager",
      system: "Return one verified city code.",
      input: {
        participants: [{
          participantId: "00000000-0000-4000-8000-000000000007",
        }],
      },
      outputSchema,
      traceId: "00000000-0000-4000-8000-000000000008",
    })).resolves.toEqual({ cityCode: "420100" });
  });

  it.each([
    ["passthrough object", z.object({ cityCode: z.string() }).passthrough()],
    ["catchall object", z.object({ cityCode: z.string() }).catchall(z.string())],
    ["root any", z.any()],
    ["nested any", z.object({ cityCode: z.string(), detail: z.any() })],
  ] as const)("rejects unsafe %s output schemas before the SDK call", async (_label, schema) => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-unsafe-schema",
      choices: [{
        message: {
          role: "assistant",
          content: JSON.stringify({
            cityCode: "420100",
            detail: { inventedFare: 99 },
            inventedFare: 99,
          }),
        },
      }],
    });

    const error = await createAgentModel()!.generate({
      agent: "manager",
      system: "Return one verified city code.",
      input: { quoteIds: ["quote-1"] },
      outputSchema: schema,
      traceId: "00000000-0000-4000-8000-000000000009",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AgentModelError);
    expect(error).toMatchObject({ code: "MODEL_INVALID_OUTPUT" });
    expect(openAiSdk.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "discriminated union",
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("saving"), quoteId: z.string() }),
        z.object({ kind: z.literal("fast"), quoteId: z.string() }),
      ]),
      { kind: "saving", quoteId: "quote-1" },
    ],
    [
      "union",
      z.union([
        z.object({ status: z.literal("complete"), count: z.number() }),
        z.object({ status: z.literal("incomplete"), missing: z.array(z.string()) }),
      ]),
      { status: "complete", count: 2 },
    ],
    ["array", z.array(z.object({ quoteId: z.string() })), [{ quoteId: "quote-1" }]],
    ["tuple", z.tuple([z.string(), z.number()]), ["quote-1", 2]],
    [
      "record",
      z.record(z.string(), z.string()),
      {
        "00000000-0000-4000-8000-000000000010": "quote-1",
        "00000000-0000-4000-8000-000000000011": "quote-2",
      },
    ],
  ] as const)("allows safe %s output schemas", async (_label, schema, providerOutput) => {
    openAiSdk.create.mockResolvedValue({
      id: "chatcmpl-safe-schema",
      choices: [{
        message: { role: "assistant", content: JSON.stringify(providerOutput) },
      }],
    });

    await expect(createAgentModel()!.generate({
      agent: "calculation",
      system: "Return structured output.",
      input: { quoteIds: ["quote-1", "quote-2"] },
      outputSchema: schema,
      traceId: "00000000-0000-4000-8000-000000000012",
    })).resolves.toEqual(providerOutput);
  });

  it("maps SDK timeout failures to a stable timeout error", async () => {
    const timeout = Object.assign(new Error("Request timed out."), {
      name: "APIConnectionTimeoutError",
    });
    openAiSdk.create.mockRejectedValue(timeout);

    const error = await runDownstreamAgent(createAgentModel()!).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AgentModelError);
    expect(error).toMatchObject({ code: "MODEL_TIMEOUT" });
    expect(String(error)).not.toContain("server-only-test-key");
  });

  it("maps other SDK failures to a stable unavailable error", async () => {
    openAiSdk.create.mockRejectedValue(
      new Error("provider failure containing server-only-test-key"),
    );

    const error = await runDownstreamAgent(createAgentModel()!).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AgentModelError);
    expect(error).toMatchObject({ code: "MODEL_UNAVAILABLE" });
    expect(String(error)).not.toContain("server-only-test-key");
  });

  it("handles cyclic timeout causes without recursing forever", async () => {
    const first = Object.assign(new Error("first"), { cause: undefined as unknown });
    const second = Object.assign(new Error("second"), { cause: first });
    first.cause = second;
    openAiSdk.create.mockRejectedValue(first);

    const error = await runDownstreamAgent(createAgentModel()!).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AgentModelError);
    expect(error).toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });
});
