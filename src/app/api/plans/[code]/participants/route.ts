import { NextResponse } from "next/server";
import { createFallbackParticipant } from "@/lib/fallback/mvp-store";
import { generateToken, hashToken } from "@/lib/security/tokens";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";
import { participantInputSchema } from "@/lib/validation/schemas";
import { resolveDepartureCityIdentity } from "@/lib/city/departure-city";

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

  const departure = await resolveDepartureCityIdentity({
    code: parsed.data.departureCityCode,
    name: parsed.data.departureCityName,
  });
  if (!departure.ok) {
    return NextResponse.json(
      { error: departure.error },
      { status: departure.error === "CITY_VALIDATION_UNAVAILABLE" ? 503 : 400 },
    );
  }
  const participant = {
    ...parsed.data,
    departureCityCode: departure.city.code,
    departureCityName: departure.city.name,
  };

  if (!hasSupabaseEnvironment()) {
    const result = await createFallbackParticipant(code, participant);
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
      p_name: participant.name,
      p_departure_city_code: participant.departureCityCode,
      p_departure_city_name: participant.departureCityName,
      p_accepted_modes: participant.acceptedModes,
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
