import { NextResponse } from "next/server";

import { findCityByCode } from "@/data/cities";
import { createAlternativePreview } from "@/lib/recommendation/alternative-preview";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await req.json().catch(() => null) as { cityCode?: unknown; cityName?: unknown } | null;
  const city = typeof body?.cityCode === "string" ? findCityByCode(body.cityCode) : null;
  if (!city || typeof body?.cityName !== "string" || city.name !== body.cityName) {
    return NextResponse.json({ error: "UNSUPPORTED_CITY" }, { status: 400 });
  }
  const participantToken = req.headers.get("x-participant-token")?.trim() ?? "";
  if (!participantToken) {
    return NextResponse.json({ error: "PARTICIPANT_TOKEN_REQUIRED" }, { status: 401 });
  }
  try {
    const result = await createAlternativePreview({
      code,
      participantToken,
      cityCode: city.code,
      cityName: city.name,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "PREVIEW_CREATE_FAILED";
    const status = errorCode === "PLAN_NOT_FOUND" ? 404
      : errorCode === "CALCULATION_IN_PROGRESS" || errorCode === "PARTICIPANT_LIMIT_NOT_REACHED" ? 409
        : errorCode === "INVALID_PARTICIPANT_TOKEN" ? 403
          : errorCode === "PARTICIPANT_TOKEN_REQUIRED" ? 401
            : 400;
    return NextResponse.json({ error: errorCode }, { status });
  }
}
