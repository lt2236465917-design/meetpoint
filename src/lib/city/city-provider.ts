import { searchLocalCities } from "@/data/cities";
import type { City } from "@/types/domain";

export async function searchCities(query: string): Promise<City[]> {
  return searchLocalCities(query);
}
