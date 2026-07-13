import { CITIES, searchLocalCities } from "@/data/cities";
import type { City } from "@/types/domain";
import { searchAmapCities } from "@/lib/city/amap-client";

export type CitySearchResult = Pick<City, "code" | "name" | "province">;

function normalizeCityName(name: string) {
  return name.trim().replace(/市$/, "");
}

function normalizeProvinceName(district: string) {
  return district
    .trim()
    .replace(/^(中国)?/, "")
    .replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区|特别行政区).*$/, "");
}

function isPrefectureLevelAdcode(adcode: string) {
  return /^\d{4}00$/.test(adcode);
}

export async function searchCities(query: string): Promise<CitySearchResult[]> {
  const local = searchLocalCities(query);
  if (local.length > 0) return local;

  const amapKey = process.env.AMAP_API_KEY;
  if (!amapKey) return [];

  const candidates = await searchAmapCities(query, { apiKey: amapKey });
  const matches: CitySearchResult[] = [];
  const seenCodes = new Set<string>();

  for (const candidate of candidates) {
    const cityName = normalizeCityName(candidate.name);
    const city = CITIES.find((supportedCity) => supportedCity.name === cityName);
    if (city) {
      if (seenCodes.has(city.code)) continue;

      matches.push(city);
      seenCodes.add(city.code);
      if (matches.length === 8) break;
      continue;
    }

    if (!candidate.adcode || !isPrefectureLevelAdcode(candidate.adcode)) continue;

    const code = `amap-${candidate.adcode}`;
    if (seenCodes.has(code)) continue;

    matches.push({
      code,
      name: cityName,
      province: normalizeProvinceName(candidate.district) || cityName,
    });
    seenCodes.add(code);
    if (matches.length === 8) break;
  }

  return matches;
}
