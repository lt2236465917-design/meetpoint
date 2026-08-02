import { createDeepSeekClient, getDeepSeekModel } from "@/lib/ai/deepseek-client";
import { z } from "zod";
import {
  AgentModelError,
  type AgentModel,
  type AgentModelRequest,
} from "./model";

type DeepSeekClient = NonNullable<ReturnType<typeof createDeepSeekClient>>;

const sensitiveInputKey =
  /(authorization|token|secret|bookingurl|rawpayload|prompt|messages?)/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isParticipantPath(path: string[]): boolean {
  return path.some((segment) => normalizedKey(segment).startsWith("participant"));
}

function assertSafeModelInput(
  value: unknown,
  path: string[] = [],
  activeObjects = new WeakSet<object>(),
  depth = 0,
): void {
  const currentPath = normalizedKey(path.at(-1) ?? "");
  if (
    (currentPath === "participant" || currentPath === "participants") &&
    (!value || typeof value !== "object")
  ) {
    throw new AgentModelError("MODEL_INVALID_OUTPUT");
  }
  if (!value || typeof value !== "object") return;
  if (depth > 64 || activeObjects.has(value)) {
    throw new AgentModelError("MODEL_INVALID_OUTPUT");
  }

  activeObjects.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) {
        assertSafeModelInput(item, path, activeObjects, depth + 1);
      }
      return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      const normalized = normalizedKey(key);
      if (
        sensitiveInputKey.test(normalized) ||
        normalized === "participantname" ||
        (normalized === "name" && isParticipantPath(path)) ||
        (normalized === "participantid" &&
          (typeof nestedValue !== "string" || !uuidPattern.test(nestedValue)))
      ) {
        throw new AgentModelError("MODEL_INVALID_OUTPUT");
      }
      assertSafeModelInput(
        nestedValue,
        [...path, key],
        activeObjects,
        depth + 1,
      );
    }
  } finally {
    activeObjects.delete(value);
  }
}

type JsonSchemaNode = Record<string, unknown>;

function isJsonSchemaNode(value: unknown): value is JsonSchemaNode {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasConcreteSchemaPolicy(schema: unknown, depth = 0): boolean {
  if (!isJsonSchemaNode(schema) || depth > 64) return false;

  const concreteKeywords = [
    "$ref",
    "type",
    "const",
    "enum",
    "properties",
    "propertyNames",
    "additionalProperties",
    "items",
    "prefixItems",
    "oneOf",
    "anyOf",
    "allOf",
    "not",
  ];
  if (!concreteKeywords.some((key) => key in schema)) return false;

  if ("properties" in schema) {
    if (!isJsonSchemaNode(schema.properties)) return false;
    if (schema.additionalProperties !== false) return false;
    if (!Object.values(schema.properties).every((property) =>
      hasConcreteSchemaPolicy(property, depth + 1),
    )) {
      return false;
    }
  }

  if (isJsonSchemaNode(schema.additionalProperties)) {
    if ("properties" in schema || !isJsonSchemaNode(schema.propertyNames)) {
      return false;
    }
    if (
      !hasConcreteSchemaPolicy(schema.propertyNames, depth + 1) ||
      !hasConcreteSchemaPolicy(schema.additionalProperties, depth + 1)
    ) {
      return false;
    }
  }

  for (const key of ["items", "contains", "not", "if", "then", "else"]) {
    if (key in schema && !hasConcreteSchemaPolicy(schema[key], depth + 1)) {
      return false;
    }
  }

  for (const key of ["prefixItems", "oneOf", "anyOf", "allOf"]) {
    if (key in schema) {
      const branches = schema[key];
      if (
        !Array.isArray(branches) ||
        branches.length === 0 ||
        !branches.every((branch) => hasConcreteSchemaPolicy(branch, depth + 1))
      ) {
        return false;
      }
    }
  }

  if ("$defs" in schema) {
    if (
      !isJsonSchemaNode(schema.$defs) ||
      !Object.values(schema.$defs).every((definition) =>
        hasConcreteSchemaPolicy(definition, depth + 1),
      )
    ) {
      return false;
    }
  }

  return true;
}

function supportsDeepSeekResponsesStrictSchema(schema: unknown, depth = 0): boolean {
  if (!isJsonSchemaNode(schema) || depth > 64) return false;
  const unsupported = [
    "$ref", "oneOf", "anyOf", "allOf", "not", "if", "then", "else",
    "prefixItems", "contains", "propertyNames",
  ];
  if (unsupported.some((key) => key in schema)) return false;
  return Object.values(schema).every((value) => {
    if (Array.isArray(value)) {
      return value.every((item) => !isJsonSchemaNode(item)
        || supportsDeepSeekResponsesStrictSchema(item, depth + 1));
    }
    return !isJsonSchemaNode(value)
      || supportsDeepSeekResponsesStrictSchema(value, depth + 1);
  });
}

function safeOutputJsonSchema(
  schema: AgentModelRequest<unknown>["outputSchema"],
): JsonSchemaNode {
  try {
    const jsonSchema = z.toJSONSchema(schema);
    if (!hasConcreteSchemaPolicy(jsonSchema)) {
      throw new AgentModelError("MODEL_INVALID_OUTPUT");
    }
    return jsonSchema;
  } catch {
    throw new AgentModelError("MODEL_INVALID_OUTPUT");
  }
}

export type DeepSeekTransport = "chat_completions" | "responses";

export type DeepSeekObservation = {
  transport: DeepSeekTransport;
  agent: AgentModelRequest<unknown>["agent"];
  schemaQualified: boolean;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  retryCount: number;
  errorCode: AgentModelError["code"] | null;
  providerHttpStatus: number | null;
  providerErrorCategory:
    | "none"
    | "authentication"
    | "rate_limit"
    | "reasoning_config"
    | "structured_output_config"
    | "input_config"
    | "model_config"
    | "unknown_bad_request"
    | "server_error";
};

type ObserveDeepSeek = (observation: DeepSeekObservation) => void;

const shadowState = { calls: 0, totalTokens: 0, inFlight: 0 };

export function resetDeepSeekShadowStateForTests(): void {
  shadowState.calls = 0;
  shadowState.totalTokens = 0;
  shadowState.inFlight = 0;
}

export function getDeepSeekTransport(): DeepSeekTransport {
  const configured = process.env.DEEPSEEK_TRANSPORT?.trim() || "chat_completions";
  if (configured === "chat_completions" || configured === "responses") {
    return configured;
  }
  throw new AgentModelError("MODEL_UNAVAILABLE");
}

function finiteUsageNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function normalizeUsage(usage: unknown) {
  const value = usage && typeof usage === "object"
    ? usage as Record<string, unknown>
    : {};
  const inputDetails = value.input_tokens_details && typeof value.input_tokens_details === "object"
    ? value.input_tokens_details as Record<string, unknown>
    : value.prompt_tokens_details && typeof value.prompt_tokens_details === "object"
      ? value.prompt_tokens_details as Record<string, unknown>
      : {};
  const outputDetails = value.output_tokens_details && typeof value.output_tokens_details === "object"
    ? value.output_tokens_details as Record<string, unknown>
    : value.completion_tokens_details && typeof value.completion_tokens_details === "object"
      ? value.completion_tokens_details as Record<string, unknown>
      : {};
  const inputTokens = finiteUsageNumber(value.input_tokens ?? value.prompt_tokens);
  const outputTokens = finiteUsageNumber(value.output_tokens ?? value.completion_tokens);
  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: finiteUsageNumber(inputDetails.cached_tokens),
    reasoningTokens: finiteUsageNumber(outputDetails.reasoning_tokens),
    totalTokens: finiteUsageNumber(value.total_tokens) || inputTokens + outputTokens,
  };
}

function addUsage(
  left: ReturnType<typeof normalizeUsage>,
  right: ReturnType<typeof normalizeUsage>,
): ReturnType<typeof normalizeUsage> {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function boundedNumber(
  name: string,
  fallback: number,
  { min, max, integer = false }: { min: number; max: number; integer?: boolean },
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    throw new AgentModelError("MODEL_UNAVAILABLE");
  }
  return parsed;
}

type DeepSeekShadowConfig = {
  transport: DeepSeekTransport;
  sampleRate: number;
  maxConcurrency: number;
  maxCalls: number;
  maxTotalTokens: number;
};

function getShadowConfig(primary: DeepSeekTransport): DeepSeekShadowConfig | null {
  const configured = process.env.DEEPSEEK_SHADOW_TRANSPORT?.trim() || "off";
  if (configured === "off") return null;
  if (configured !== "chat_completions" && configured !== "responses") {
    throw new AgentModelError("MODEL_UNAVAILABLE");
  }
  if (configured === primary) throw new AgentModelError("MODEL_UNAVAILABLE");
  return {
    transport: configured,
    sampleRate: boundedNumber("DEEPSEEK_SHADOW_SAMPLE_RATE", 0, { min: 0, max: 1 }),
    maxConcurrency: boundedNumber("DEEPSEEK_SHADOW_MAX_CONCURRENCY", 1, {
      min: 1, max: 4, integer: true,
    }),
    maxCalls: boundedNumber("DEEPSEEK_SHADOW_MAX_CALLS_PER_PROCESS", 20, {
      min: 1, max: 100, integer: true,
    }),
    maxTotalTokens: boundedNumber("DEEPSEEK_SHADOW_MAX_TOTAL_TOKENS_PER_PROCESS", 100_000, {
      min: 1, max: 500_000, integer: true,
    }),
  };
}

function preservesObjectKeys(
  source: unknown,
  parsed: unknown,
  depth = 0,
): boolean {
  if (!source || typeof source !== "object") return true;
  if (depth > 64) return false;

  if (Array.isArray(source)) {
    if (!Array.isArray(parsed) || source.length !== parsed.length) return false;
    return source.every((item, index) =>
      preservesObjectKeys(item, parsed[index], depth + 1),
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const parsedRecord = parsed as Record<string, unknown>;
  return Object.entries(source).every(
    ([key, value]) =>
      Object.prototype.hasOwnProperty.call(parsedRecord, key) &&
      preservesObjectKeys(value, parsedRecord[key], depth + 1),
  );
}

function isTimeoutError(
  error: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): boolean {
  if (!error || typeof error !== "object") return false;
  if (depth > 16 || seen.has(error)) return false;
  seen.add(error);

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    cause?: unknown;
  };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const code = typeof candidate.code === "string" ? candidate.code : "";

  return (
    name === "APIConnectionTimeoutError" ||
    name === "AbortError" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    isTimeoutError(candidate.cause, seen, depth + 1)
  );
}

function safeProviderHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}

function safeProviderErrorCategory(
  error: unknown,
): DeepSeekObservation["providerErrorCategory"] {
  if (!error || typeof error !== "object") return "none";
  const candidate = error as { status?: unknown; param?: unknown; message?: unknown };
  const status = safeProviderHttpStatus(error);
  const param = typeof candidate.param === "string" ? candidate.param.toLowerCase() : "";
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  const searchable = `${param} ${message}`;
  if (status === 401 || status === 403) return "authentication";
  if (status === 429) return "rate_limit";
  if (status !== null && status >= 500) return "server_error";
  if (/reasoning|effort/.test(searchable)) return "reasoning_config";
  if (/json.schema|json_schema|text\.format|response format|structured output/.test(searchable)) {
    return "structured_output_config";
  }
  if (/instructions|\binput\b/.test(searchable)) return "input_config";
  if (/\bmodel\b/.test(searchable)) return "model_config";
  return status === 400 ? "unknown_bad_request" : "none";
}

class DeepSeekAgentModel implements AgentModel {
  readonly provider = "deepseek";

  constructor(
    private readonly client: DeepSeekClient,
    readonly model: string,
    private readonly transport: DeepSeekTransport,
    private readonly observe?: ObserveDeepSeek,
  ) {}

  private emit(
    request: AgentModelRequest<unknown>,
    startedAt: number,
    retryCount: number,
    usage: ReturnType<typeof normalizeUsage>,
    errorCode: AgentModelError["code"] | null,
    providerHttpStatus: number | null = null,
    providerErrorCategory: DeepSeekObservation["providerErrorCategory"] = "none",
  ): void {
    try {
      this.observe?.({
        transport: this.transport,
        agent: request.agent,
        schemaQualified: errorCode === null,
        latencyMs: Math.max(0, Date.now() - startedAt),
        ...usage,
        retryCount,
        errorCode,
        providerHttpStatus,
        providerErrorCategory,
      });
    } catch {
      // Telemetry must never affect model behavior.
    }
  }

  async generate<T>(request: AgentModelRequest<T>): Promise<T> {
    const startedAt = Date.now();
    const emptyUsage = normalizeUsage(null);
    let input: string;
    let outputJsonSchema: JsonSchemaNode;
    try {
      outputJsonSchema = safeOutputJsonSchema(request.outputSchema);
      input = JSON.stringify(request.input);
      if (typeof input !== "string") {
        throw new AgentModelError("MODEL_INVALID_OUTPUT");
      }
      const serializedInput: unknown = JSON.parse(input);
      assertSafeModelInput(serializedInput);
    } catch {
      this.emit(request, startedAt, 0, emptyUsage, "MODEL_INVALID_OUTPUT");
      throw new AgentModelError("MODEL_INVALID_OUTPUT");
    }

    let lastInvalid: AgentModelError | null = null;
    let accumulatedUsage = emptyUsage;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const instructions = `${request.system}\n只输出 JSON 对象，不得输出 Markdown 或额外文字。`;
        let usage = emptyUsage;
        const content = this.transport === "responses"
          ? await (async () => {
            const format = supportsDeepSeekResponsesStrictSchema(outputJsonSchema)
              ? {
                  type: "json_schema" as const,
                  name: "agent_output",
                  schema: outputJsonSchema,
                  strict: true,
                }
              : { type: "json_object" as const };
            const response = await this.client.responses.create({
              model: this.model,
              instructions,
              input,
              max_output_tokens: 4096,
              reasoning: { effort: "none" },
              text: { format },
            });
            usage = normalizeUsage(response.usage);
            return response.output_text;
          })()
          : await (async () => {
            const response = await this.client.chat.completions.create({
              model: this.model,
              response_format: { type: "json_object" },
              max_tokens: 4096,
              ...({ thinking: { type: "disabled" } } as Record<string, unknown>),
              messages: [
                { role: "system", content: instructions },
                { role: "user", content: input },
              ],
            });
            usage = normalizeUsage(response.usage);
            return response.choices[0]?.message?.content;
          })();
        accumulatedUsage = addUsage(accumulatedUsage, usage);
        if (!content) throw new AgentModelError("MODEL_INVALID_OUTPUT");

        let parsed: unknown;
        try {
          parsed = JSON.parse(content);
        } catch {
          throw new AgentModelError("MODEL_INVALID_OUTPUT");
        }

        const result = request.outputSchema.safeParse(parsed);
        if (!result.success || !preservesObjectKeys(parsed, result.data)) {
          throw new AgentModelError("MODEL_INVALID_OUTPUT");
        }
        this.emit(request, startedAt, attempt, accumulatedUsage, null);
        return result.data;
      } catch (error) {
        if (error instanceof AgentModelError) {
          if (error.code === "MODEL_INVALID_OUTPUT") {
            lastInvalid = error;
            continue;
          }
          throw error;
        }
        if (isTimeoutError(error)) {
          this.emit(
            request, startedAt, attempt, accumulatedUsage,
            "MODEL_TIMEOUT", safeProviderHttpStatus(error), safeProviderErrorCategory(error),
          );
          throw new AgentModelError("MODEL_TIMEOUT");
        }
        this.emit(
            request, startedAt, attempt, accumulatedUsage,
            "MODEL_UNAVAILABLE", safeProviderHttpStatus(error), safeProviderErrorCategory(error),
        );
        throw new AgentModelError("MODEL_UNAVAILABLE");
      }
    }
    this.emit(request, startedAt, 1, accumulatedUsage, "MODEL_INVALID_OUTPUT");
    throw lastInvalid ?? new AgentModelError("MODEL_INVALID_OUTPUT");
  }
}

class ShadowingAgentModel implements AgentModel {
  readonly provider: string;
  readonly model: string;

  constructor(
    private readonly primary: DeepSeekAgentModel,
    private readonly shadow: DeepSeekAgentModel,
    private readonly config: NonNullable<ReturnType<typeof getShadowConfig>>,
  ) {
    this.provider = primary.provider;
    this.model = primary.model;
  }

  generate<T>(request: AgentModelRequest<T>): Promise<T> {
    const withinBudget = shadowState.calls < this.config.maxCalls
      && shadowState.inFlight < this.config.maxConcurrency
      && shadowState.totalTokens < this.config.maxTotalTokens;
    if (withinBudget && this.config.sampleRate > 0 && Math.random() < this.config.sampleRate) {
      shadowState.calls += 1;
      shadowState.inFlight += 1;
      void this.shadow.generate(request)
        .catch(() => undefined)
        .finally(() => { shadowState.inFlight = Math.max(0, shadowState.inFlight - 1); });
    }
    return this.primary.generate(request);
  }
}

export function createAgentModel(): AgentModel | null {
  const client = createDeepSeekClient();
  if (!client) return null;
  const model = getDeepSeekModel();
  const primaryTransport = getDeepSeekTransport();
  const primary = new DeepSeekAgentModel(client, model, primaryTransport);
  const shadowConfig = getShadowConfig(primaryTransport);
  if (!shadowConfig || shadowConfig.sampleRate === 0) return primary;
  const shadow = new DeepSeekAgentModel(
    client,
    model,
    shadowConfig.transport,
    (observation) => {
      shadowState.totalTokens += observation.totalTokens;
      console.info("deepseek_shadow", JSON.stringify(observation));
    },
  );
  return new ShadowingAgentModel(primary, shadow, shadowConfig);
}

export function createAgentModelForTransport(
  transport: DeepSeekTransport,
  observe: (observation: DeepSeekObservation) => void,
): AgentModel | null {
  const client = createDeepSeekClient();
  if (!client) return null;
  return new DeepSeekAgentModel(client, getDeepSeekModel(), transport, observe);
}
