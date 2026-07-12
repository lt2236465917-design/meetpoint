import { z } from "zod";

const amapResponseSchema = z.object({
  status: z.literal("1"),
  tips: z.array(z.object({
    name: z.string().min(1),
    district: z.string().optional().default(""),
    adcode: z.string().regex(/^\d{6}$/).optional(),
  })).default([]),
});

export type AmapCityCandidate = z.infer<typeof amapResponseSchema>["tips"][number];

export interface SearchAmapCitiesOptions {
  apiKey: string;
  signal?: AbortSignal;
}

export async function searchAmapCities(
  query: string,
  options: SearchAmapCitiesOptions,
): Promise<AmapCityCandidate[]> {
  const keywords = query.trim();
  if (!keywords || !options.apiKey) return [];

  const url = new URL("https://restapi.amap.com/v3/assistant/inputtips");
  url.searchParams.set("keywords", keywords);
  url.searchParams.set("key", options.apiKey);

  try {
    const response = await fetch(url, {
      signal: options.signal ?? AbortSignal.timeout(3000),
    });
    if (!response.ok) return [];

    const parsed = amapResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.tips : [];
  } catch {
    return [];
  }
}
