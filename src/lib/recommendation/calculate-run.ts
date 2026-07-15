import { startAutomaticRun } from "@/lib/agent/run-orchestrator";
import { calculateFallbackRecommendations } from "@/lib/fallback/mvp-store";
import { hasSupabaseEnvironment } from "@/lib/supabase/server";

/**
 * Compatibility entry point for the calculate HTTP boundary. It creates the
 * run matrix only; quote collection is advanced through bounded follow-up
 * requests so this call never holds a supplier request open.
 */
export async function calculatePlanRecommendations(input: {
  code: string;
  participantToken: string;
}) {
  // Task 10 replaces this compatibility branch with contract-parity local persistence.
  if (!hasSupabaseEnvironment()) return calculateFallbackRecommendations(input.code);
  return startAutomaticRun(input);
}
