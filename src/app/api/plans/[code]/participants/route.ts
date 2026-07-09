import { NextResponse } from "next/server";
import { createFallbackParticipant } from "@/lib/fallback/mvp-store";
import { generateToken, hashToken } from "@/lib/security/tokens";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";
import { participantInputSchema } from "@/lib/validation/schemas";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = participantInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (!hasSupabaseEnvironment()) {
    const result = await createFallbackParticipant(code, parsed.data);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({
      participantId: result.participantId,
      editToken: result.editToken,
    });
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, participant_limit")
    .eq("code", code)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
  }

  const { count } = await supabase
    .from("participants")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id);

  if ((count ?? 0) >= plan.participant_limit) {
    return NextResponse.json(
      { error: "PARTICIPANT_LIMIT_REACHED" },
      { status: 409 },
    );
  }

  const editToken = generateToken();
  const editTokenHash = await hashToken(editToken);
  const { data, error } = await supabase
    .from("participants")
    .insert({
      plan_id: plan.id,
      name: parsed.data.name,
      departure_city_code: parsed.data.departureCityCode,
      departure_city_name: parsed.data.departureCityName,
      accepted_modes: parsed.data.acceptedModes,
      edit_token_hash: editTokenHash,
      created_by_host: false,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("create participant error", error);
    return NextResponse.json(
      { error: "CREATE_PARTICIPANT_FAILED" },
      { status: 500 },
    );
  }

  return NextResponse.json({ participantId: data.id, editToken });
}
