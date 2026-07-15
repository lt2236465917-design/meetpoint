import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const openAiSdk = vi.hoisted(() => ({
  options: undefined as
    | { baseURL?: string; apiKey?: string; timeout?: number; maxRetries?: number }
    | undefined,
  create: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    readonly timeout: number | undefined;
    readonly maxRetries: number | undefined;
    readonly chat = { completions: { create: openAiSdk.create } };

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
import { createAgentModel } from "@/lib/agent/deepseek-model";

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
    openAiSdk.options = undefined;
    openAiSdk.create.mockReset();
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
      messages: [
        { role: "system", content: "Return one verified city code." },
        { role: "user", content: '{"quoteIds":["quote-1"]}' },
      ],
    }));
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
