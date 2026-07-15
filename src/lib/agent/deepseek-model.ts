import { createDeepSeekClient, getDeepSeekModel } from "@/lib/ai/deepseek-client";
import {
  AgentModelError,
  type AgentModel,
  type AgentModelRequest,
} from "./model";

type DeepSeekClient = NonNullable<ReturnType<typeof createDeepSeekClient>>;

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

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
    (candidate.cause !== error && isTimeoutError(candidate.cause))
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
      input = JSON.stringify(request.input);
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
      if (!result.success) {
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
