import {
  verifyFallbackParticipantCanCalculate,
} from "@/lib/fallback/mvp-store";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";
import { verifyToken } from "@/lib/security/tokens";

type ParticipantCalculationResult =
  | { ok: true; planId: string; participantId: string }
  | { ok: false; status: number; error: string };

export async function verifyParticipantCanCalculatePlan({
  code,
  participantToken,
}: {
  code: string;
  participantToken: string | null;
}): Promise<ParticipantCalculationResult> {
  const normalizedToken = participantToken?.trim() ?? "";
  if (!normalizedToken) {
    return {
      ok: false,
      status: 401,
      error: "PARTICIPANT_TOKEN_REQUIRED",
    };
  }

  if (!hasSupabaseEnvironment()) {
    return verifyFallbackParticipantCanCalculate(code, normalizedToken);
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, participant_limit")
    .eq("code", code)
    .single();

  if (!plan) {
    return { ok: false, status: 404, error: "PLAN_NOT_FOUND" };
  }

  const { data: participants } = await supabase
    .from("participants")
    .select("id, edit_token_hash")
    .eq("plan_id", plan.id);

  const participantRows = participants ?? [];
  if (participantRows.length < plan.participant_limit) {
    return {
      ok: false,
      status: 409,
      error: "PARTICIPANT_LIMIT_NOT_REACHED",
    };
  }

  for (const participant of participantRows) {
    if (await verifyToken(normalizedToken, participant.edit_token_hash)) {
      return {
        ok: true,
        planId: plan.id,
        participantId: participant.id,
      };
    }
  }

  return {
    ok: false,
    status: 403,
    error: "INVALID_PARTICIPANT_TOKEN",
  };
}
