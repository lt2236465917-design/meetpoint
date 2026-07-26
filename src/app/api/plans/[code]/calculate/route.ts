import { NextResponse } from "next/server";
import { calculatePlanRecommendations } from "@/lib/recommendation/calculate-run";
import { verifyParticipantCanCalculatePlan } from "@/lib/security/participant-calculation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const verified = await verifyParticipantCanCalculatePlan({
    code,
    participantToken: req.headers.get("x-participant-token"),
  });

  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.error },
      { status: verified.status },
    );
  }

  try {
    const result = await calculatePlanRecommendations({
      code,
      participantToken: req.headers.get("x-participant-token") ?? "",
    });
    return NextResponse.json(result, {
      status: result.disposition === "created" ? 202 : 200,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CALCULATION_FAILED";
    const conflictCodes = new Set([
      "CALCULATION_IN_PROGRESS",
      "SHARED_RESULT_EXISTS",
      "SHARED_RESULT_REQUIRED",
    ]);
    return NextResponse.json(
      { error: code },
      { status: conflictCodes.has(code) ? 409 : 400 },
    );
  }
}
