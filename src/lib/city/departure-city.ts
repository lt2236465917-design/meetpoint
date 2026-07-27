import { CITIES, findCityByCode } from "@/data/cities";
import { resolveAmapCityByAdcode } from "@/lib/city/amap-client";

export type DepartureCityIdentity = {
  code: string;
  name: string;
};

export type DepartureCityResolution =
  | { ok: true; city: DepartureCityIdentity }
  | {
      ok: false;
      error: "INVALID_DEPARTURE_CITY" | "CITY_VALIDATION_UNAVAILABLE";
    };

function normalizeCityName(name: string) {
  return name.trim().replace(/(特别行政区|市)$/, "");
}

export async function resolveDepartureCityIdentity(input: {
  code: string;
  name: string;
}): Promise<DepartureCityResolution> {
  const builtIn = findCityByCode(input.code);
  if (builtIn) {
    return normalizeCityName(input.name) === normalizeCityName(builtIn.name)
      ? { ok: true, city: { code: builtIn.code, name: builtIn.name } }
      : { ok: false, error: "INVALID_DEPARTURE_CITY" };
  }

  if (/^amap-\d{6}$/.test(input.code)) {
    const resolved = await resolveAmapCityByAdcode(input.code.slice(5), {
      apiKey: process.env.AMAP_API_KEY ?? "",
    });
    if (resolved.status === "unavailable") {
      return { ok: false, error: "CITY_VALIDATION_UNAVAILABLE" };
    }
    if (resolved.status === "not_found") {
      return { ok: false, error: "INVALID_DEPARTURE_CITY" };
    }
    const canonicalName = normalizeCityName(resolved.city.name);
    if (normalizeCityName(input.name) !== canonicalName) {
      return { ok: false, error: "INVALID_DEPARTURE_CITY" };
    }
    const local = CITIES.find((city) =>
      normalizeCityName(city.name) === canonicalName
    );
    return local
      ? { ok: true, city: { code: local.code, name: local.name } }
      : { ok: true, city: { code: input.code, name: canonicalName } };
  }
  return { ok: false, error: "INVALID_DEPARTURE_CITY" };
}
