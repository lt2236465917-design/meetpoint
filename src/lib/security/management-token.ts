import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { verifyFallbackManagementToken } from "@/lib/fallback/mvp-store";
import { hasSupabaseEnvironment } from "@/lib/supabase/server";
import { verifyToken } from "./tokens";

export type ManagementTokenResult =
  | { ok: true; planId: string }
  | { ok: false; status: number; error: string };

export async function verifyManagementTokenForPlan(
  code: string,
  token: string | null,
): Promise<ManagementTokenResult> {
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "MANAGEMENT_TOKEN_REQUIRED",
    };
  }

  if (!hasSupabaseEnvironment()) {
    return verifyFallbackManagementToken(code, token);
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, management_token_hash")
    .eq("code", code)
    .single();

  if (!plan) {
    return { ok: false, status: 404, error: "PLAN_NOT_FOUND" };
  }

  const valid = await verifyToken(token, plan.management_token_hash);
  if (!valid) {
    return { ok: false, status: 403, error: "INVALID_MANAGEMENT_TOKEN" };
  }

  return { ok: true, planId: plan.id };
}
