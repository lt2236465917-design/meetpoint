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

function assertSafeOutputSchema(schema: AgentModelRequest<unknown>["outputSchema"]): void {
  try {
    if (!hasConcreteSchemaPolicy(z.toJSONSchema(schema))) {
      throw new AgentModelError("MODEL_INVALID_OUTPUT");
    }
  } catch {
    throw new AgentModelError("MODEL_INVALID_OUTPUT");
  }
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

class DeepSeekAgentModel implements AgentModel {
  readonly provider = "deepseek";

  constructor(
    private readonly client: DeepSeekClient,
    readonly model: string,
  ) {}

  async generate<T>(request: AgentModelRequest<T>): Promise<T> {
    let input: string;
    try {
      assertSafeOutputSchema(request.outputSchema);
      input = JSON.stringify(request.input);
      if (typeof input !== "string") {
        throw new AgentModelError("MODEL_INVALID_OUTPUT");
      }
      const serializedInput: unknown = JSON.parse(input);
      assertSafeModelInput(serializedInput);
    } catch {
      throw new AgentModelError("MODEL_INVALID_OUTPUT");
    }

    let lastInvalid: AgentModelError | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          response_format: { type: "json_object" },
          max_tokens: 4096,
          ...({ thinking: { type: "disabled" } } as Record<string, unknown>),
          messages: [
            {
              role: "system",
              content: `${request.system}\n只输出 JSON 对象，不得输出 Markdown 或额外文字。`,
            },
            { role: "user", content: input },
          ],
        });
        const content = response.choices[0]?.message?.content;
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
        return result.data;
      } catch (error) {
        if (error instanceof AgentModelError) {
          if (error.code === "MODEL_INVALID_OUTPUT") {
            lastInvalid = error;
            continue;
          }
          throw error;
        }
        if (isTimeoutError(error)) throw new AgentModelError("MODEL_TIMEOUT");
        throw new AgentModelError("MODEL_UNAVAILABLE");
      }
    }
    throw lastInvalid ?? new AgentModelError("MODEL_INVALID_OUTPUT");
  }
}

export function createAgentModel(): AgentModel | null {
  const client = createDeepSeekClient();
  if (!client) return null;
  return new DeepSeekAgentModel(client, getDeepSeekModel());
}
