import { CITIES, findCityByCode } from "@/data/cities";
import type { City } from "@/types/domain";
import { haversineKm } from "./distance";

export type GenerateCandidateCitiesInput = {
  departureCityCodes: string[];
  departureCoordinates?: Array<{ code: string; lat: number; lng: number }>;
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
  const explicitCoordinates = new Map(
    (input.departureCoordinates ?? []).map((city) => [city.code, city]),
  );
  const departureCities = input.departureCityCodes.map((code) => {
    const builtIn = findCityByCode(code);
    const explicit = explicitCoordinates.get(code);
    if (explicit && Number.isFinite(explicit.lat) && Number.isFinite(explicit.lng)) return explicit;
    return builtIn ? { code: builtIn.code, lat: builtIn.lat, lng: builtIn.lng } : null;
  });
  if (departureCities.some((city) => city === null) || departureCities.length === 0) return [];

  const coordinates = departureCities.filter((city): city is NonNullable<typeof city> => city !== null);
  const midpoint = {
    lat: coordinates.reduce((sum, city) => sum + city.lat, 0) / coordinates.length,
    lng: coordinates.reduce((sum, city) => sum + city.lng, 0) / coordinates.length,
  };

  const map = new Map<string, City>();
  for (const code of input.departureCityCodes) {
    const city = findCityByCode(code);
    if (city) map.set(city.code, city);
  }
  for (const code of input.manualAddCityCodes ?? []) {
    const city = findCityByCode(code);
    if (city) map.set(city.code, city);
  }

  const hubs = CITIES
    .filter((city) => city.isAirportHub || city.isRailHub || city.isProvincialCapital || city.isMunicipality)
    .sort((a, b) => cityScore(a, midpoint) - cityScore(b, midpoint) || a.code.localeCompare(b.code));

  for (const city of hubs) {
    if (map.size >= limit + manualExclude.size) break;
    map.set(city.code, city);
  }

  return Array.from(map.values())
    .filter((city) => !manualExclude.has(city.code))
    .sort((a, b) => cityScore(a, midpoint) - cityScore(b, midpoint) || a.code.localeCompare(b.code))
    .slice(0, limit);
}
