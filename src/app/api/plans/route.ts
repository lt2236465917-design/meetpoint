import { NextResponse } from "next/server";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { createPlanSchema } from "@/lib/validation/schemas";

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = createPlanSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  const code = generateCode();
  const manageToken = generateToken();
  const managementTokenHash = await hashToken(manageToken);

  const { error } = await supabase.from("plans").insert({
    code,
    title: parsed.data.title,
    meeting_date: parsed.data.meetingDate,
    target_arrival_time: parsed.data.targetArrivalTime,
    participant_limit: parsed.data.participantLimit,
    management_token_hash: managementTokenHash,
    status: "collecting",
  });

  if (error) {
    console.error("create plan error", error);
    return NextResponse.json(
      { error: "CREATE_PLAN_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    code,
    manageToken,
    shareUrl: `/p/${code}`,
  });
}
