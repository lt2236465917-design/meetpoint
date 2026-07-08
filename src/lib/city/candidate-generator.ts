import { CITIES, findCityByCode } from "@/data/cities";
import type { City } from "@/types/domain";
import { haversineKm } from "./distance";

export type GenerateCandidateCitiesInput = {
  departureCityCodes: string[];
  manualAddCityCodes?: string[];
  manualExcludeCityCodes?: string[];
  limit?: number;
};

function cityScore(city: City, midpoint: { lat: number; lng: number }): number {
  const hubBonus =
    (city.isAirportHub ? 150 : 0) +
    (city.isRailHub ? 180 : 0) +
    (city.isProvincialCapital ? 80 : 0) +
    (city.isMunicipality ? 100 : 0);
  return haversineKm(city, midpoint) - hubBonus;
}

export function generateCandidateCities(input: GenerateCandidateCitiesInput): City[] {
  const limit = input.limit ?? 12;
  const manualExclude = new Set(input.manualExcludeCityCodes ?? []);
  const departureCities = input.departureCityCodes
    .map(findCityByCode)
    .filter((city): city is City => Boolean(city));

  const midpoint = departureCities.length
    ? {
        lat: departureCities.reduce((sum, city) => sum + city.lat, 0) / departureCities.length,
        lng: departureCities.reduce((sum, city) => sum + city.lng, 0) / departureCities.length,
      }
    : { lat: 30.5928, lng: 114.3055 };

  const map = new Map<string, City>();
  for (const city of departureCities) map.set(city.code, city);
  for (const code of input.manualAddCityCodes ?? []) {
    const city = findCityByCode(code);
    if (city) map.set(city.code, city);
  }

  const hubs = CITIES
    .filter((city) => city.isAirportHub || city.isRailHub || city.isProvincialCapital || city.isMunicipality)
    .sort((a, b) => cityScore(a, midpoint) - cityScore(b, midpoint));

  for (const city of hubs) {
    if (map.size >= limit + manualExclude.size) break;
    map.set(city.code, city);
  }

  return Array.from(map.values())
    .filter((city) => !manualExclude.has(city.code))
    .slice(0, limit);
}
