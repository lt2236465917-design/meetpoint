import { createDeepSeekClient, getDeepSeekModel } from "@/lib/ai/deepseek-client";
import {
  AgentModelError,
  type AgentModel,
  type AgentModelRequest,
} from "./model";

type DeepSeekClient = NonNullable<ReturnType<typeof createDeepSeekClient>>;

const sensitiveInputKey =
  /(authorization|token|secret|bookingurl|rawpayload|prompt|messages?)/;

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
        (normalized === "name" && isParticipantPath(path))
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
      assertSafeModelInput(request.input);
      input = JSON.stringify(request.input);
      if (typeof input !== "string") {
        throw new AgentModelError("MODEL_INVALID_OUTPUT");
      }
    } catch {
      throw new AgentModelError("MODEL_INVALID_OUTPUT");
    }

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: request.system },
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
      if (error instanceof AgentModelError) throw error;
      if (isTimeoutError(error)) throw new AgentModelError("MODEL_TIMEOUT");
      throw new AgentModelError("MODEL_UNAVAILABLE");
    }
  }
}

export function createAgentModel(): AgentModel | null {
  const client = createDeepSeekClient();
  if (!client) return null;
  return new DeepSeekAgentModel(client, getDeepSeekModel());
}
