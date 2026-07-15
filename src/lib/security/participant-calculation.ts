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
    .select("id")
    .eq("plan_id", plan.id);

  const participantRows = participants ?? [];
  if (participantRows.length < plan.participant_limit) {
    return {
      ok: false,
      status: 409,
      error: "PARTICIPANT_LIMIT_NOT_REACHED",
    };
  }

  const participantIds = participantRows.map((participant) => participant.id);
  const { data: credentials } = await supabase
    .from("participant_credentials")
    .select("participant_id, edit_token_hash")
    .in("participant_id", participantIds);

  for (const credential of credentials ?? []) {
    if (await verifyToken(normalizedToken, credential.edit_token_hash)) {
      return {
        ok: true,
        planId: plan.id,
        participantId: credential.participant_id,
      };
    }
  }

  return {
    ok: false,
    status: 403,
    error: "INVALID_PARTICIPANT_TOKEN",
  };
}
