import { NextResponse } from "next/server";
import { searchCities } from "@/lib/city/city-provider";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const cities = await searchCities(q);

  return NextResponse.json({
    cities: cities.map((city) => ({
      code: city.code,
      name: city.name,
      province: city.province,
    })),
  });
}
