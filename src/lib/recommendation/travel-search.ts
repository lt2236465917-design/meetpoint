import type { QueryOutcome, VerifiedQuote } from "@/lib/agent/contracts";
import { validateArrivalDate } from "@/lib/recommendation/date";
import type { RouteTaskDraft } from "@/lib/recommendation/query-matrix";
import { GatewayClientError, searchGateway } from "@/lib/travel/gateway-client";

const RETRYABLE_CODES = new Set([
  "GATEWAY_TIMEOUT",
  "GATEWAY_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UPSTREAM_UNAVAILABLE",
]);

export async function executeRouteTask(task: RouteTaskDraft): Promise<QueryOutcome> {
  try {
    const response = await searchGateway({
      originCityCode: task.originCityCode,
      originCityName: task.originCityName ?? task.originCityCode,
      destinationCityCode: task.cityCode,
      destinationCityName: task.cityName ?? task.cityCode,
      departureDate: task.searchDate,
      mode: task.mode,
    });

    const quotes = response.options
      .filter((option) => option.mode === task.mode)
      .map((option): VerifiedQuote => ({
        id: option.quoteId,
        quoteId: option.quoteId,
        providerQuoteId: option.providerQuoteId,
        participantId: task.participantId,
        cityCode: task.cityCode,
        mode: option.mode,
        searchDate: task.searchDate,
        queriedAt: response.queriedAt,
        priceCny: option.priceCny,
        departAt: option.departAt,
        arriveAt: option.arriveAt,
        durationMinutes: option.durationMinutes,
        transferCount: option.transferCount,
        isDirect: option.isDirect,
        serviceName: option.serviceName,
      }))
      .filter((quote) => validateArrivalDate(quote, task.arrivalDate).ok)
      .sort((left, right) => left.quoteId.localeCompare(right.quoteId));

    return quotes.length > 0 ? { status: "success", quotes } : { status: "empty" };
  } catch (error) {
    const code = error instanceof GatewayClientError ? error.code : "INTERNAL_ERROR";
    if (code === "PROVIDER_NO_ROUTE" || code === "PROVIDER_NO_TICKET") {
      return { status: "empty" };
    }
    if (RETRYABLE_CODES.has(code)) {
      return {
        status: "retryable_failure",
        code,
        retryAfterMs: error instanceof GatewayClientError && error.retryAfterMs !== null
          ? error.retryAfterMs
          : 0,
      };
    }
    return { status: "terminal_failure", code };
  }
}
