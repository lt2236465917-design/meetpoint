import { z } from "zod";

import { TtlCache } from "./cache.js";
import {
  gatewaySearchRequestSchema,
  gatewaySearchResponseSchema,
  gatewayTravelOptionSchema,
  type GatewayErrorCode,
  type GatewaySearchRequest,
  type GatewaySearchResponse,
} from "./contracts.js";
import { FlyAIAdapterError, searchFlyAI, type FlyAIDiagnostic } from "./flyai-adapter.js";
import { FifoLimiter } from "./limiter.js";

export class GatewayServiceError extends Error {
  constructor(readonly code: GatewayErrorCode, message: string) {
    super(message);
    this.name = "GatewayServiceError";
  }
}

export interface TravelSearchService {
  search(input: unknown): Promise<GatewaySearchResponse>;
}

interface ServiceDependencies {
  searchProvider?: (input: GatewaySearchRequest) => Promise<unknown>;
  diagnosticLogger?: (event: FlyAIDiagnostic) => void;
  cache?: TtlCache<GatewaySearchResponse>;
  limiter?: FifoLimiter;
  now?: () => Date;
}

const providerOptionsSchema = z.array(gatewayTravelOptionSchema);

function cacheKey(input: GatewaySearchRequest): string {
  return ["v1", input.originCityCode, input.destinationCityCode, input.meetingDate, input.mode].join(":");
}

function publicProviderMessage(code: GatewayErrorCode): string {
  if (code === "PROVIDER_TIMEOUT") return "Provider request timed out";
  if (code === "PROVIDER_UNAVAILABLE") return "Provider unavailable";
  if (code === "PROVIDER_NO_ROUTE") return "Provider found no route";
  if (code === "PROVIDER_NO_TICKET") return "Provider found no ticket";
  if (code === "PROVIDER_RATE_LIMITED") return "Provider rate limited";
  if (code === "PROVIDER_UPSTREAM_UNAVAILABLE") return "Provider upstream unavailable";
  if (code === "PROVIDER_CLI_FAILED") return "Provider CLI failed";
  return "Provider returned an invalid response";
}

function shouldRetryProviderError(code: GatewayErrorCode): boolean {
  return code === "PROVIDER_TIMEOUT"
    || code === "PROVIDER_UNAVAILABLE"
    || code === "PROVIDER_UPSTREAM_UNAVAILABLE";
}

function writeGatewayDiagnostic(event: FlyAIDiagnostic): void {
  const {
    routeFingerprint,
    mode,
    outcome,
    topLevelKeys,
    dataKeys,
    itemKeys,
    itemCount,
    normalizedCount,
    droppedCount,
    droppedReasons,
    cliErrorCode,
  } = event;
  console.info(JSON.stringify({
    event: "flyai_diagnostic",
    routeFingerprint,
    mode,
    outcome,
    topLevelKeys,
    dataKeys,
    itemKeys,
    itemCount,
    normalizedCount,
    droppedCount,
    droppedReasons,
    cliErrorCode,
  }));
}

export function createTravelSearchService(dependencies: ServiceDependencies = {}): TravelSearchService {
  const diagnosticLogger = dependencies.diagnosticLogger ?? writeGatewayDiagnostic;
  const searchProvider = dependencies.searchProvider ?? ((request: GatewaySearchRequest) =>
    searchFlyAI(request, { diagnosticLogger }));
  const cache = dependencies.cache ?? new TtlCache<GatewaySearchResponse>();
  const limiter = dependencies.limiter ?? new FifoLimiter();
  const now = dependencies.now ?? (() => new Date());
  const inFlight = new Map<string, Promise<GatewaySearchResponse>>();
  let cooldownUntil = 0;
  let nextCooldownMs = 5_000;

  async function waitForCooldown(): Promise<void> {
    if (cooldownUntil <= 0) return;
    const remainingMs = cooldownUntil - now().getTime();
    if (remainingMs <= 0) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, remainingMs);
    });
  }

  async function callProvider(request: GatewaySearchRequest): Promise<unknown> {
    await waitForCooldown();
    try {
      const rawOptions = await searchProvider(request);
      nextCooldownMs = 5_000;
      return rawOptions;
    } catch (error) {
      if (error instanceof FlyAIAdapterError && error.code === "PROVIDER_RATE_LIMITED") {
        cooldownUntil = now().getTime() + nextCooldownMs;
        nextCooldownMs = 15_000;
      }
      throw error;
    }
  }

  async function fetchAndNormalize(
    request: GatewaySearchRequest,
    key: string,
    queriedAt: Date,
  ): Promise<GatewaySearchResponse> {
    let rawOptions: unknown;
    try {
      rawOptions = await limiter.run(async () => {
        try {
          return await callProvider(request);
        } catch (error) {
          if (error instanceof FlyAIAdapterError && shouldRetryProviderError(error.code)) {
            return callProvider(request);
          }
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof FlyAIAdapterError) {
        throw new GatewayServiceError(error.code, publicProviderMessage(error.code));
      }
      throw new GatewayServiceError("INTERNAL_ERROR", "Gateway request failed");
    }

    const options = providerOptionsSchema.safeParse(rawOptions);
    if (!options.success) {
      throw new GatewayServiceError("PROVIDER_INVALID_RESPONSE", "Provider returned an invalid response");
    }
    const response = gatewaySearchResponseSchema.parse({ options: options.data, queriedAt: queriedAt.toISOString() });
    cache.set(key, structuredClone(response), queriedAt.getTime());
    return response;
  }

  return {
    async search(input: unknown): Promise<GatewaySearchResponse> {
      const parsedRequest = gatewaySearchRequestSchema.safeParse(input);
      if (!parsedRequest.success) throw new GatewayServiceError("INVALID_REQUEST", "Invalid request");

      const timestamp = now();
      const key = cacheKey(parsedRequest.data);
      const cached = cache.get(key, timestamp.getTime());
      if (cached !== undefined) return structuredClone(cached);

      const existing = inFlight.get(key);
      const pending = existing ?? fetchAndNormalize(parsedRequest.data, key, timestamp);
      if (!existing) {
        inFlight.set(key, pending);
        void pending.finally(() => inFlight.delete(key)).catch(() => undefined);
      }
      return structuredClone(await pending);
    },
  };
}
