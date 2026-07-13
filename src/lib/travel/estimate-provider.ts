import { findCityByCode } from "@/data/cities";
import { haversineKm } from "@/lib/city/distance";
import type { TransportMode, TravelOption } from "@/types/domain";
import type { TravelSearchInput } from "./types";

function estimatePrice(distanceKm: number, mode: TransportMode): number {
  if (mode === "flight") return Math.max(380, Math.round(distanceKm * 0.55));
  if (mode === "high_speed_rail") {
    return Math.max(80, Math.round(distanceKm * 0.46));
  }
  return Math.max(45, Math.round(distanceKm * 0.18));
}

function estimateDuration(distanceKm: number, mode: TransportMode): number {
  if (mode === "flight") return Math.round((distanceKm / 700) * 60 + 120);
  if (mode === "high_speed_rail") return Math.round((distanceKm / 240) * 60);
  return Math.round((distanceKm / 80) * 60);
}

export function estimateTravelOption(
  input: TravelSearchInput,
  mode: TransportMode,
  failureReason = "二次查询后仍无稳定真实报价",
): TravelOption {
  const origin = findCityByCode(input.originCityCode);
  const destination = findCityByCode(input.destinationCityCode);
  const distanceKm = origin && destination ? haversineKm(origin, destination) : 800;

  return {
    participantId: input.participantId,
    candidateCityCode: input.destinationCityCode,
    mode,
    source: "estimated",
    provider: "estimate",
    queriedAt: null,
    priceCny: estimatePrice(distanceKm, mode),
    departAt: null,
    arriveAt: null,
    durationMinutes: estimateDuration(distanceKm, mode),
    waitMinutes: null,
    isDirect: true,
    hasTransfer: false,
    transferCount: 0,
    serviceName: null,
    departureStationName: null,
    arrivalStationName: null,
    bookingUrl: null,
    failureReason,
  };
}
