import { z } from "zod";

const amapResponseSchema = z.object({
  status: z.literal("1"),
  tips: z.array(z.object({
    name: z.string().min(1),
    district: z.string().optional().default(""),
    adcode: z.string().regex(/^\d{6}$/).optional(),
  })).default([]),
});

const amapDistrictResponseSchema = z.object({
  status: z.literal("1"),
  districts: z.array(z.object({
    name: z.string().min(1),
    adcode: z.string().regex(/^\d{6}$/),
    level: z.string(),
  })).default([]),
});

const amapDistrictTreeNodeSchema = z.object({
  name: z.string().min(1),
  adcode: z.string().regex(/^\d{6}$/),
  level: z.string(),
  districts: z.array(z.unknown()).default([]),
});

const amapDistrictTreeResponseSchema = z.object({
  status: z.literal("1"),
  districts: z.array(z.unknown()).default([]),
});

export type AmapCityCandidate = {
  name: string;
  district: string;
  adcode: string;
};

export interface SearchAmapCitiesOptions {
  apiKey: string;
  signal?: AbortSignal;
}

let cachedAmapCityIndex: AmapCityCandidate[] | null = null;
let amapCityIndexPromise: Promise<AmapCityCandidate[]> | null = null;

export function resetAmapCityIndexCacheForTests() {
  cachedAmapCityIndex = null;
  amapCityIndexPromise = null;
}

export async function searchAmapCities(
  query: string,
  options: SearchAmapCitiesOptions,
): Promise<AmapCityCandidate[]> {
  const keywords = query.trim();
  if (!keywords || !options.apiKey) return [];
  if (cachedAmapCityIndex) {
    return findIndexedCities(keywords, cachedAmapCityIndex);
  }

  const districtUrl = new URL("https://restapi.amap.com/v3/config/district");
  districtUrl.searchParams.set("keywords", keywords);
  districtUrl.searchParams.set("subdistrict", "0");
  districtUrl.searchParams.set("extensions", "base");
  districtUrl.searchParams.set("key", options.apiKey);

  const tipsUrl = new URL("https://restapi.amap.com/v3/assistant/inputtips");
  tipsUrl.searchParams.set("keywords", keywords);
  tipsUrl.searchParams.set("key", options.apiKey);

  const cityIndexPromise = getAmapCityIndex(options.apiKey);

  const signal = options.signal ?? AbortSignal.timeout(5000);
  const [initialDistrictPayload, tipsPayload] = await Promise.all([
    fetchAmapJson(districtUrl, signal),
    fetchAmapJson(tipsUrl, signal),
  ]);
  let districtPayload = initialDistrictPayload;
  let districts = amapDistrictResponseSchema.safeParse(districtPayload);
  if (!districts.success) {
    districtPayload = await fetchAmapJson(
      districtUrl,
      options.signal ?? AbortSignal.timeout(5000),
    );
    districts = amapDistrictResponseSchema.safeParse(districtPayload);
  }
  const tips = amapResponseSchema.safeParse(tipsPayload);
  const validTips = tips.success ? tips.data.tips : [];
  const merged = new Map<string, AmapCityCandidate>();

  if (districts.success) {
    for (const district of districts.data.districts) {
      if (!isSelectableCityDistrict(district)) continue;
      const provinceTip = validTips.find((tip) => (
        tip.adcode?.slice(0, 4) === district.adcode.slice(0, 4)
      ));
      merged.set(district.adcode, {
        name: district.name,
        district: provinceTip?.district ?? "",
        adcode: district.adcode,
      });
    }
  }

  // Keep compatibility with the rare input-tip row that already carries a
  // canonical prefecture adcode. District-level tip adcodes are never promoted.
  for (const tip of validTips) {
    if (!tip.adcode || !/^\d{4}00$/.test(tip.adcode)) continue;
    if (!merged.has(tip.adcode)) {
      merged.set(tip.adcode, {
        name: tip.name,
        district: tip.district,
        adcode: tip.adcode,
      });
    }
  }

  if (merged.size === 0) {
    const indexedCities = await cityIndexPromise;
    for (const city of findIndexedCities(keywords, indexedCities)) {
      merged.set(city.adcode, city);
    }
  }

  return [...merged.values()];
}

const directAdminAdcodes = new Set([
  "110000",
  "120000",
  "310000",
  "500000",
  "810000",
  "820000",
]);

function isSelectableCityDistrict(district: {
  adcode: string;
  level: string;
  name: string;
}) {
  if (district.level === "province") {
    return directAdminAdcodes.has(district.adcode);
  }
  if (district.level !== "city") {
    return false;
  }
  if (/^(110100|120100|310100|500100)$/.test(district.adcode)) {
    return false;
  }
  return (
    /^\d{4}00$/.test(district.adcode)
    || /(市|自治州|地区|盟|林区)$/.test(district.name)
  );
}

async function fetchAmapJson(url: URL, signal: AbortSignal): Promise<unknown> {
  try {
    const response = await fetch(url, { signal });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function normalizeAmapCityName(name: string) {
  return name.trim().replace(/(特别行政区|市)$/, "");
}

function findIndexedCities(
  keywords: string,
  cities: AmapCityCandidate[],
) {
  const normalizedKeywords = normalizeAmapCityName(keywords);
  return cities.filter((city) => (
    normalizeAmapCityName(city.name).includes(normalizedKeywords)
    || city.name.includes(keywords)
  ));
}

async function getAmapCityIndex(apiKey: string): Promise<AmapCityCandidate[]> {
  if (cachedAmapCityIndex) return cachedAmapCityIndex;
  if (amapCityIndexPromise) return amapCityIndexPromise;

  amapCityIndexPromise = loadAmapCityIndex(apiKey);
  const cities = await amapCityIndexPromise;
  amapCityIndexPromise = null;
  if (cities.length > 0) cachedAmapCityIndex = cities;
  return cities;
}

async function loadAmapCityIndex(apiKey: string): Promise<AmapCityCandidate[]> {
  const url = new URL("https://restapi.amap.com/v3/config/district");
  url.searchParams.set("keywords", "中国");
  url.searchParams.set("subdistrict", "2");
  url.searchParams.set("extensions", "base");
  url.searchParams.set("key", apiKey);
  const payload = await fetchAmapJson(url, AbortSignal.timeout(12000));
  const response = amapDistrictTreeResponseSchema.safeParse(payload);
  if (!response.success) return [];
  const root = amapDistrictTreeNodeSchema.safeParse(response.data.districts[0]);
  if (!root.success) return [];

  const cities: AmapCityCandidate[] = [];
  for (const rawProvince of root.data.districts) {
    const province = amapDistrictTreeNodeSchema.safeParse(rawProvince);
    if (!province.success) continue;

    if (isSelectableCityDistrict(province.data)) {
      cities.push({
        name: province.data.name,
        district: province.data.name,
        adcode: province.data.adcode,
      });
    }

    for (const rawCity of province.data.districts) {
      const city = amapDistrictTreeNodeSchema.safeParse(rawCity);
      if (!city.success || !isSelectableCityDistrict(city.data)) continue;
      cities.push({
        name: city.data.name,
        district: province.data.name,
        adcode: city.data.adcode,
      });
    }
  }
  return cities;
}
