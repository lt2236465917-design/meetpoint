import { searchFlyAI, type FlyAIAdapterError } from "./flyai-adapter.js";
import type { GatewaySearchRequest, GatewayTravelOption } from "./contracts.js";

const MODES = ["flight", "high_speed_rail"] as const;

type Search = (input: GatewaySearchRequest) => Promise<GatewayTravelOption[]>;

function travelDate(now: Date): string {
  const date = new Date(now.getTime());
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export type ContractProbeSummary = {
  provider: "flyai";
  mode: typeof MODES[number];
  status: "ok" | "failed" | "missing_credentials";
  latencyMs: number;
  optionCount: number;
  code?: string;
  schemaDriftSignature?: string | null;
};

export async function probeLiveContract({
  search = searchFlyAI,
  now = new Date(),
}: { search?: Search; now?: Date } = {}): Promise<ContractProbeSummary[]> {
  if (!process.env.FLYAI_API_KEY) {
    return MODES.map((mode) => ({
      provider: "flyai",
      mode,
      status: "missing_credentials",
      latencyMs: 0,
      optionCount: 0,
    }));
  }
  const departureDate = process.env.PROBE_TRAVEL_DATE ?? travelDate(now);
  const summaries: ContractProbeSummary[] = [];
  for (const mode of MODES) {
    const startedAt = Date.now();
    try {
      const result = await search({
        originCityCode: "beijing",
        originCityName: "北京",
        destinationCityCode: "wuhan",
        destinationCityName: "武汉",
        departureDate,
        mode,
      });
      summaries.push({
        provider: "flyai",
        mode,
        status: "ok",
        latencyMs: Math.max(0, Date.now() - startedAt),
        optionCount: result.length,
      });
    } catch (error) {
      const failure = error as Partial<FlyAIAdapterError>;
      summaries.push({
        provider: "flyai",
        mode,
        status: "failed",
        latencyMs: Math.max(0, Date.now() - startedAt),
        optionCount: 0,
        code: typeof failure.code === "string" ? failure.code : "INTERNAL_ERROR",
        schemaDriftSignature: typeof failure.schemaDriftSignature === "string"
          ? failure.schemaDriftSignature
          : null,
      });
    }
  }
  return summaries;
}
