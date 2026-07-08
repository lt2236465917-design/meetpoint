import { searchLocalCities } from "@/data/cities";
import type { City } from "@/types/domain";

export async function searchCities(query: string): Promise<City[]> {
  const local = searchLocalCities(query);
  if (local.length > 0) return local;

  const amapKey = process.env.AMAP_API_KEY;
  if (!amapKey) return [];

  return [];
}
