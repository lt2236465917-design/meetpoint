import type { TravelOption } from "@/types/domain";
import { estimateTravelOption } from "./estimate-provider";
import { searchGateway } from "./gateway-client";
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

async function searchMode(
  input: TravelSearchInput,
  mode: GatewaySearchRequest["mode"],
): Promise<TravelOption[]> {
  try {
    const response = await searchGateway(toGatewayRequest(input, mode));
    const options = response.options
      .filter((option) => option.mode === mode)
      .map((option) => ({
        ...option,
        participantId: input.participantId,
        candidateCityCode: input.destinationCityCode,
        queriedAt: response.queriedAt,
        waitMinutes: null,
        failureReason: null,
      }));

    return options.length > 0
      ? options
      : [createUnavailableTravelOption(input, mode, "NO_FEASIBLE_SAME_DAY_ROUTE")];
  } catch {
    return [estimateTravelOption(input, mode)];
  }
}

export class FlyAITravelProvider implements TravelProvider {
  async search(input: TravelSearchInput): Promise<TravelOption[]> {
    const byMode = await Promise.all(input.acceptedModes.map((mode) => searchMode(input, mode)));
    return byMode.flat();
  }
}
