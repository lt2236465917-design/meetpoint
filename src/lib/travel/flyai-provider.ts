import type { TravelOption } from "@/types/domain";
import { estimateTravelOption } from "./estimate-provider";
import { GatewayClientError, searchGateway } from "./gateway-client";
import { createUnavailableTravelOption } from "./unavailable-option";
import type { GatewaySearchRequest, TravelProvider, TravelSearchInput } from "./types";

function toGatewayRequest(input: TravelSearchInput, mode: GatewaySearchRequest["mode"]): GatewaySearchRequest {
  return {
    originCityCode: input.originCityCode,
    originCityName: input.originCityName,
    destinationCityCode: input.destinationCityCode,
    destinationCityName: input.destinationCityName,
    meetingDate: input.meetingDate,
    mode,
  };
}

function routeTieBreakKey(option: TravelOption): string {
  return JSON.stringify([
    option.mode,
    option.serviceName,
    option.departAt,
    option.priceCny,
    option.durationMinutes,
    option.isDirect,
    option.hasTransfer,
    option.transferCount,
    option.bookingUrl,
    option.arriveAt,
    option.queriedAt,
    option.participantId,
    option.candidateCityCode,
    option.source,
    option.provider,
    option.waitMinutes,
    option.failureReason,
  ]);
}

function compareRouteFacts(left: TravelOption, right: TravelOption): number {
  const leftKey = routeTieBreakKey(left);
  const rightKey = routeTieBreakKey(right);
  return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
}

async function searchMode(
  input: TravelSearchInput,
  mode: GatewaySearchRequest["mode"],
): Promise<TravelOption[]> {
  try {
    const response = await searchGateway(toGatewayRequest(input, mode));
    // The scorer keeps the first route when selection scores tie, so do not let
    // provider response order decide the shared recommendation.
    const options = response.options
      .filter((option) => option.mode === mode)
      .map((option) => ({
        ...option,
        participantId: input.participantId,
        candidateCityCode: input.destinationCityCode,
        queriedAt: response.queriedAt,
        waitMinutes: null,
        failureReason: null,
      }))
      .sort(compareRouteFacts);

    return options.length > 0
      ? options
      : [createUnavailableTravelOption(input, mode, "NO_FEASIBLE_SAME_DAY_ROUTE")];
  } catch (error) {
    const failureReason =
      error instanceof GatewayClientError
        ? error.code
        : "真实报价暂不可用，使用距离和交通方式粗估";
    return [estimateTravelOption(input, mode, failureReason)];
  }
}

export class FlyAITravelProvider implements TravelProvider {
  async search(input: TravelSearchInput): Promise<TravelOption[]> {
    const modes = [...new Set(input.acceptedModes)];
    const byMode = await Promise.all(modes.map((mode) => searchMode(input, mode)));
    return byMode.flat();
  }
}
