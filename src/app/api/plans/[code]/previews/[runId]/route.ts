import { NextResponse } from "next/server";

import { readAlternativePreview } from "@/lib/recommendation/alternative-preview";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string; runId: string }> },
) {
  const { code, runId } = await params;
  const preview = await readAlternativePreview({
    code,
    runId,
    participantToken: req.headers.get("x-participant-token"),
    hostToken: req.headers.get("x-host-token"),
  });
  return preview
    ? NextResponse.json(preview)
    : NextResponse.json({ error: "PREVIEW_NOT_FOUND" }, { status: 404 });
}
