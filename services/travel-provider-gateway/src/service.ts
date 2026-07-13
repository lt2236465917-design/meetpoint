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
import { FlyAIAdapterError, searchFlyAI } from "./flyai-adapter.js";
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
    || code === "PROVIDER_RATE_LIMITED"
    || code === "PROVIDER_UPSTREAM_UNAVAILABLE";
}

export function createTravelSearchService(dependencies: ServiceDependencies = {}): TravelSearchService {
  const searchProvider = dependencies.searchProvider ?? searchFlyAI;
  const cache = dependencies.cache ?? new TtlCache<GatewaySearchResponse>();
  const limiter = dependencies.limiter ?? new FifoLimiter();
  const now = dependencies.now ?? (() => new Date());

  return {
    async search(input: unknown): Promise<GatewaySearchResponse> {
      const parsedRequest = gatewaySearchRequestSchema.safeParse(input);
      if (!parsedRequest.success) throw new GatewayServiceError("INVALID_REQUEST", "Invalid request");

      const timestamp = now();
      const key = cacheKey(parsedRequest.data);
      const cached = cache.get(key, timestamp.getTime());
      if (cached !== undefined) return structuredClone(cached);

      let rawOptions: unknown;
      try {
        rawOptions = await limiter.run(async () => {
          try {
            return await searchProvider(parsedRequest.data);
          } catch (error) {
            if (error instanceof FlyAIAdapterError && shouldRetryProviderError(error.code)) {
              return searchProvider(parsedRequest.data);
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
      const response = gatewaySearchResponseSchema.parse({ options: options.data, queriedAt: timestamp.toISOString() });
      cache.set(key, structuredClone(response), timestamp.getTime());
      return response;
    },
  };
}
