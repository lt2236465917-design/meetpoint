import { CITIES, searchLocalCities } from "@/data/cities";
import type { City } from "@/types/domain";
import { searchAmapCities } from "@/lib/city/amap-client";

export type CitySearchResult = Pick<City, "code" | "name" | "province">;

function normalizeCityName(name: string) {
  return name.trim().replace(/(特别行政区|市)$/, "");
}

function normalizeProvinceName(district: string) {
  return district
    .trim()
    .replace(/^(中国)?/, "")
    .replace(/(省|市|自治区|壮族自治区|回族自治区|维吾尔自治区|特别行政区).*$/, "");
}

export async function searchCities(query: string): Promise<CitySearchResult[]> {
  const local = searchLocalCities(query).map(({ code, name, province }) => ({
    code,
    name,
    province,
  }));
  const seenCodes = new Set(local.map((city) => city.code));
  const seenNames = new Set(local.map((city) => normalizeCityName(city.name)));

  const amapKey = process.env.AMAP_API_KEY;
  if (!amapKey) return local.slice(0, 8);

  const candidates = await searchAmapCities(query, { apiKey: amapKey });
  const merged = [...local];

  for (const candidate of candidates) {
    const cityName = normalizeCityName(candidate.name);
    const city = CITIES.find((supportedCity) => supportedCity.name === cityName);
    if (city) {
      if (seenCodes.has(city.code) || seenNames.has(city.name)) continue;

      merged.push({ code: city.code, name: city.name, province: city.province });
      seenCodes.add(city.code);
      seenNames.add(city.name);
      if (merged.length === 8) break;
      continue;
    }

    const code = `amap-${candidate.adcode}`;
    if (seenCodes.has(code) || seenNames.has(cityName)) continue;

    merged.push({
      code,
      name: cityName,
      province: normalizeProvinceName(candidate.district) || "中国",
    });
    seenCodes.add(code);
    seenNames.add(cityName);
    if (merged.length === 8) break;
  }

  return merged.slice(0, 8);
}
