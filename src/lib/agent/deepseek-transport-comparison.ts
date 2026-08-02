import type { AgentModel, AgentModelRequest, AgentName } from "@/lib/agent/model";
import type {
  DeepSeekObservation,
  DeepSeekTransport,
} from "@/lib/agent/deepseek-model";

export type DeepSeekComparisonModelFactory = (
  transport: DeepSeekTransport,
  observe: (observation: DeepSeekObservation) => void,
) => AgentModel;

export type DeepSeekComparisonCase = {
  name: AgentName;
  request: AgentModelRequest<unknown>;
  qualify(value: unknown): boolean;
};

type MutableMetrics = {
  calls: number;
  schemaQualified: number;
  downstreamQualified: number;
  latencies: number[];
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  retries: number;
  timeouts: number;
  unavailable: number;
  invalidOutput: number;
  http4xx: number;
  http5xx: number;
  httpStatusCounts: Record<string, number>;
  providerErrorCounts: Record<string, number>;
};

function emptyMetrics(): MutableMetrics {
  return {
    calls: 0,
    schemaQualified: 0,
    downstreamQualified: 0,
    latencies: [],
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    retries: 0,
    timeouts: 0,
    unavailable: 0,
    invalidOutput: 0,
    http4xx: 0,
    http5xx: 0,
    httpStatusCounts: {},
    providerErrorCounts: {},
  };
}

function applyObservation(metrics: MutableMetrics, observation: DeepSeekObservation): void {
  metrics.latencies.push(observation.latencyMs);
  metrics.inputTokens += observation.inputTokens;
  metrics.outputTokens += observation.outputTokens;
  metrics.cachedInputTokens += observation.cachedInputTokens;
  metrics.reasoningTokens += observation.reasoningTokens;
  metrics.totalTokens += observation.totalTokens;
  metrics.retries += observation.retryCount;
  if (observation.errorCode === "MODEL_TIMEOUT") metrics.timeouts += 1;
  if (observation.errorCode === "MODEL_UNAVAILABLE") metrics.unavailable += 1;
  if (observation.errorCode === "MODEL_INVALID_OUTPUT") metrics.invalidOutput += 1;
  if (observation.providerHttpStatus !== null && observation.providerHttpStatus >= 400 && observation.providerHttpStatus < 500) metrics.http4xx += 1;
  if (observation.providerHttpStatus !== null && observation.providerHttpStatus >= 500) metrics.http5xx += 1;
  if (observation.providerHttpStatus !== null) {
    const key = String(observation.providerHttpStatus);
    metrics.httpStatusCounts[key] = (metrics.httpStatusCounts[key] ?? 0) + 1;
  }
  metrics.providerErrorCounts[observation.providerErrorCategory] =
    (metrics.providerErrorCounts[observation.providerErrorCategory] ?? 0) + 1;
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]!;
}

function finalize(metrics: MutableMetrics) {
  const uncachedInputTokens = Math.max(0, metrics.inputTokens - metrics.cachedInputTokens);
  const estimatedCostCny = (
    metrics.cachedInputTokens * 0.02
    + uncachedInputTokens * 1
    + metrics.outputTokens * 2
  ) / 1_000_000;
  return {
    calls: metrics.calls,
    schemaQualified: metrics.schemaQualified,
    downstreamQualified: metrics.downstreamQualified,
    p95LatencyMs: percentile95(metrics.latencies),
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    cachedInputTokens: metrics.cachedInputTokens,
    reasoningTokens: metrics.reasoningTokens,
    totalTokens: metrics.totalTokens,
    estimatedCostCny,
    retries: metrics.retries,
    timeouts: metrics.timeouts,
    unavailable: metrics.unavailable,
    invalidOutput: metrics.invalidOutput,
    http4xx: metrics.http4xx,
    http5xx: metrics.http5xx,
    httpStatusCounts: { ...metrics.httpStatusCounts },
    providerErrorCounts: { ...metrics.providerErrorCounts },
  };
}

export async function compareDeepSeekTransports(input: {
  cases: readonly DeepSeekComparisonCase[];
  iterations: number;
  createModel: DeepSeekComparisonModelFactory;
}) {
  if (!Number.isInteger(input.iterations) || input.iterations < 1 || input.iterations > 100) {
    throw new Error("INVALID_COMPARISON_LIMIT");
  }
  if (input.cases.length === 0 || input.cases.length > 8) {
    throw new Error("INVALID_COMPARISON_CASES");
  }

  const transports = ["chat_completions", "responses"] as const;
  const aggregate = {
    chat_completions: emptyMetrics(),
    responses: emptyMetrics(),
  };
  const byAgent = Object.fromEntries(transports.map((transport) => [transport, {
    manager: emptyMetrics(),
    calculation: emptyMetrics(),
    supervisor: emptyMetrics(),
    fallback: emptyMetrics(),
  }])) as Record<DeepSeekTransport, Record<AgentName, MutableMetrics>>;

  for (let iteration = 0; iteration < input.iterations; iteration += 1) {
    for (const comparisonCase of input.cases) {
      if (comparisonCase.name !== comparisonCase.request.agent) {
        throw new Error("INVALID_COMPARISON_CASE");
      }
      for (const transport of transports) {
        let observed: DeepSeekObservation | null = null;
        const model = input.createModel(transport, (observation) => { observed = observation; });
        const startedAt = Date.now();
        const target = aggregate[transport];
        const agentTarget = byAgent[transport][comparisonCase.name];
        target.calls += 1;
        agentTarget.calls += 1;
        try {
          const value = await model.generate(comparisonCase.request);
          target.schemaQualified += 1;
          agentTarget.schemaQualified += 1;
          if (comparisonCase.qualify(value)) {
            target.downstreamQualified += 1;
            agentTarget.downstreamQualified += 1;
          }
        } catch {
          // Stable error details come only from the redacted observation.
        }
        const safeObservation: DeepSeekObservation = observed ?? {
          transport,
          agent: comparisonCase.name,
          schemaQualified: false,
          latencyMs: Math.max(0, Date.now() - startedAt),
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
          retryCount: 0,
          errorCode: "MODEL_UNAVAILABLE",
          providerHttpStatus: null,
          providerErrorCategory: "none",
        };
        applyObservation(target, safeObservation);
        applyObservation(agentTarget, safeObservation);
      }
    }
  }

  return {
    model: "deepseek-v4-flash",
    pairedCalls: input.iterations * input.cases.length,
    priceBasisCnyPerMillionTokens: {
      cachedInput: 0.02,
      uncachedInput: 1,
      output: 2,
      note: "official_base_rate_2026-08-01_excludes_peak_multiplier",
    },
    transports: {
      chat_completions: finalize(aggregate.chat_completions),
      responses: finalize(aggregate.responses),
    },
    byAgent: Object.fromEntries(transports.map((transport) => [transport, {
      manager: finalize(byAgent[transport].manager),
      calculation: finalize(byAgent[transport].calculation),
      supervisor: finalize(byAgent[transport].supervisor),
      fallback: finalize(byAgent[transport].fallback),
    }])),
  };
}
