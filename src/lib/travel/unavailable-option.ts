import type { TransportMode, TravelOption } from "@/types/domain";
import type { TravelSearchInput } from "./types";

export function createUnavailableTravelOption(
  input: TravelSearchInput,
  mode: TransportMode,
  reason: "NO_FEASIBLE_SAME_DAY_ROUTE",
): TravelOption {
  return {
    participantId: input.participantId,
    candidateCityCode: input.destinationCityCode,
    mode,
    source: "unavailable",
    provider: "flyai",
    queriedAt: null,
    priceCny: null,
    departAt: null,
    arriveAt: null,
    durationMinutes: null,
    waitMinutes: null,
    isDirect: false,
    hasTransfer: false,
    transferCount: 0,
    serviceName: null,
    departureStationName: null,
    arrivalStationName: null,
    bookingUrl: null,
    failureReason: reason,
  };
}
