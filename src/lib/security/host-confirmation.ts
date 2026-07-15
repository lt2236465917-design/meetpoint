import { confirmFallbackAlternative } from "@/lib/fallback/mvp-store";
import { verifyToken } from "@/lib/security/tokens";
import { createServiceSupabaseClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

export async function confirmAlternativePreview(input: {
  code: string;
  runId: string;
  hostToken: string;
}): Promise<{ runId: string; status: "completed" }> {
  const hostToken = input.hostToken.trim();
  if (!hostToken) throw new Error("HOST_TOKEN_REQUIRED");
  if (!hasSupabaseEnvironment()) {
    await confirmFallbackAlternative({ code: input.code, runId: input.runId, hostToken });
    return { runId: input.runId, status: "completed" };
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase.from("plans").select("id").eq("code", input.code).single();
  if (!plan) throw new Error("RUN_NOT_FOUND");
  const { data: run } = await supabase
    .from("recommendation_runs")
    .select("id,status,kind")
    .eq("id", input.runId)
    .eq("plan_id", plan.id)
    .single();
  if (!run || run.kind !== "alternative") throw new Error("RUN_NOT_FOUND");
  const { data: credential } = await supabase
    .from("plan_credentials")
    .select("host_token_hash")
    .eq("plan_id", plan.id)
    .single();
  if (!credential || !await verifyToken(hostToken, credential.host_token_hash)) {
    throw new Error("INVALID_HOST_TOKEN");
  }
  if (run.status === "completed") return { runId: run.id, status: "completed" };
  if (run.status !== "awaiting_host_confirmation") throw new Error("RUN_NOT_FOUND");

  const { data: proposals } = await supabase
    .from("recommendation_proposals")
    .select("id,version,supervisor_approved_version")
    .eq("run_id", run.id)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1);
  const proposal = proposals?.[0];
  if (!proposal || proposal.supervisor_approved_version !== proposal.version) {
    throw new Error("APPROVED_PROPOSAL_NOT_FOUND");
  }
  const { data, error } = await supabase.rpc("confirm_alternative_result", {
    p_run_id: run.id,
    p_proposal_id: proposal.id,
    p_host_token_hash: credential.host_token_hash,
  });
  if (error || typeof data !== "string") throw new Error("HOST_CONFIRMATION_FAILED");
  return { runId: run.id, status: "completed" };
}
