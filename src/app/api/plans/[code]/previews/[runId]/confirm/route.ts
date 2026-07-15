import { NextResponse } from "next/server";

import { confirmAlternativePreview } from "@/lib/security/host-confirmation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string; runId: string }> },
) {
  const { code, runId } = await params;
  const hostToken = req.headers.get("x-host-token")?.trim() ?? "";
  if (!hostToken) {
    return NextResponse.json({ error: "HOST_TOKEN_REQUIRED" }, { status: 401 });
  }
  try {
    return NextResponse.json(await confirmAlternativePreview({ code, runId, hostToken }));
  } catch (error) {
    const errorCode = error instanceof Error ? error.message : "HOST_CONFIRMATION_FAILED";
    const status = errorCode === "INVALID_HOST_TOKEN" ? 403
      : errorCode === "RUN_NOT_FOUND" ? 404
        : 400;
    return NextResponse.json({ error: errorCode }, { status });
  }
}
