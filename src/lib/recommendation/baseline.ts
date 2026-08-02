import { createHash } from "node:crypto";

import type { City } from "@/types/domain";

export const BASELINE_POLICY_VERSION = "2026-08-01.baseline.v1";

export type BaselineRecommendation = {
  cityCode: string;
  cityName: string;
  policyVersion: typeof BASELINE_POLICY_VERSION;
  evidenceLevel: "canonical_coordinates_and_hubs";
  inputFingerprint: string;
};

export function createBaselineRecommendation(input: {
  candidates: readonly City[];
  departures: ReadonlyArray<{ code: string; lat: number; lng: number }>;
}): BaselineRecommendation | null {
  const city = input.candidates[0];
  if (!city || input.departures.length < 2) return null;
  if (input.departures.some((departure) => (
    !Number.isFinite(departure.lat) || !Number.isFinite(departure.lng)
  ))) return null;
  const canonical = [...input.departures]
    .sort((left, right) => left.code.localeCompare(right.code))
    .map((departure) => [departure.code, departure.lat, departure.lng]);
  return {
    cityCode: city.code,
    cityName: city.name,
    policyVersion: BASELINE_POLICY_VERSION,
    evidenceLevel: "canonical_coordinates_and_hubs",
    inputFingerprint: createHash("sha256").update(JSON.stringify(canonical)).digest("hex"),
  };
}
