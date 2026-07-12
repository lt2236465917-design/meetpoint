import { CITIES, searchLocalCities } from "@/data/cities";
import type { City } from "@/types/domain";
import { searchAmapCities } from "@/lib/city/amap-client";

export async function searchCities(query: string): Promise<City[]> {
  const local = searchLocalCities(query);
  if (local.length > 0) return local;

  const amapKey = process.env.AMAP_API_KEY;
  if (!amapKey) return [];

  const candidates = await searchAmapCities(query, { apiKey: amapKey });
  const matches: City[] = [];
  const seenCodes = new Set<string>();

  for (const candidate of candidates) {
    const cityName = candidate.name.replace(/市$/, "");
    const city = CITIES.find((supportedCity) => supportedCity.name === cityName);
    if (!city || seenCodes.has(city.code)) continue;

    matches.push(city);
    seenCodes.add(city.code);
    if (matches.length === 8) break;
  }

  return matches;
}
