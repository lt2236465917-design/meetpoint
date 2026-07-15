import { NextResponse } from "next/server";

import { advanceRun } from "@/lib/agent/run-orchestrator";
import { verifyParticipantCanCalculatePlan } from "@/lib/security/participant-calculation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string; runId: string }> },
) {
  const { code, runId } = await params;
  const verified = await verifyParticipantCanCalculatePlan({
    code,
    participantToken: req.headers.get("x-participant-token"),
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status });
  }
  try {
    const progress = await advanceRun({ runId, planId: verified.planId });
    return NextResponse.json(progress);
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "RUN_ADVANCE_FAILED";
    return NextResponse.json({ error: errorCode }, { status: errorCode === "RUN_NOT_FOUND" ? 404 : 400 });
  }
}
