import { z } from "zod";

import { confirmFallbackAlternative } from "@/lib/fallback/mvp-store";
import { SupabaseRecommendationRepository } from "@/lib/recommendation/repository";
import { verifyToken } from "@/lib/security/tokens";
import { createServiceSupabaseClient, hasSupabaseEnvironment } from "@/lib/supabase/server";

const confirmationResultSchema = z.discriminatedUnion("disposition", [
  z.object({
    disposition: z.literal("completed"),
    resultId: z.uuid(),
  }).strict(),
  z.object({
    disposition: z.literal("rejected"),
    code: z.literal("PREVIEW_EXPIRED"),
  }).strict(),
]);

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
    .select("id,status,kind,stale_after")
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
  const now = new Date();
  if (!run.stale_after || new Date(run.stale_after).getTime() <= now.getTime()) {
    const expired = await new SupabaseRecommendationRepository().expireStaleRun(
      run.id,
      "awaiting_host_confirmation",
      now.toISOString(),
    );
    if (!expired) {
      const { data: current } = await supabase
        .from("recommendation_runs")
        .select("status")
        .eq("id", run.id)
        .eq("plan_id", plan.id)
        .single();
      if (current?.status === "completed") {
        return { runId: run.id, status: "completed" };
      }
    }
    throw new Error("PREVIEW_EXPIRED");
  }

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
  if (error) throw new Error("HOST_CONFIRMATION_FAILED");
  const parsed = confirmationResultSchema.safeParse(data);
  if (!parsed.success) throw new Error("HOST_CONFIRMATION_FAILED");
  if (parsed.data.disposition === "rejected") throw new Error(parsed.data.code);
  return { runId: run.id, status: "completed" };
}
