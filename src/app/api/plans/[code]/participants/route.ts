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
  const editToken = generateToken();
  const editTokenHash = await hashToken(editToken);
  const { data: participantId, error } = await supabase.rpc(
    "create_participant_with_credential",
    {
      p_code: code,
      p_name: parsed.data.name,
      p_departure_city_code: parsed.data.departureCityCode,
      p_departure_city_name: parsed.data.departureCityName,
      p_accepted_modes: parsed.data.acceptedModes,
      p_edit_token_hash: editTokenHash,
    },
  );

  if (error || !participantId) {
    const stableError = participantRpcError(error);
    return NextResponse.json(
      { error: stableError.error },
      { status: stableError.status },
    );
  }

  return NextResponse.json({ participantId, editToken });
}

function participantRpcError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : "";
  if (message.includes("PLAN_NOT_FOUND")) {
    return { error: "PLAN_NOT_FOUND", status: 404 } as const;
  }
  if (message.includes("PARTICIPANT_LIMIT_REACHED")) {
    return { error: "PARTICIPANT_LIMIT_REACHED", status: 409 } as const;
  }
  return { error: "CREATE_PARTICIPANT_FAILED", status: 500 } as const;
}
