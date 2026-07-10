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
    const result = await calculatePlanRecommendations({ code });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CALCULATION_FAILED" },
      { status: 400 },
    );
  }
}
