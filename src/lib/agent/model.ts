import type { z } from "zod";

export type AgentName =
  | "manager"
  | "calculation"
  | "supervisor"
  | "fallback";

export type AgentModelErrorCode =
  | "MODEL_UNAVAILABLE"
  | "MODEL_TIMEOUT"
  | "MODEL_INVALID_OUTPUT";

export class AgentModelError extends Error {
  readonly code: AgentModelErrorCode;

  constructor(code: AgentModelErrorCode) {
    super(code);
    this.name = "AgentModelError";
    this.code = code;
  }
}

export interface AgentModelRequest<T> {
  agent: AgentName;
  system: string;
  input: unknown;
  outputSchema: z.ZodType<T>;
  traceId: string;
}

export interface AgentModel {
  readonly provider: string;
  readonly model: string;
  generate<T>(request: AgentModelRequest<T>): Promise<T>;
}
