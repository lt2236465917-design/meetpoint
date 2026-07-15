import { NextResponse } from "next/server";
import { readFallbackPlan } from "@/lib/fallback/mvp-store";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  if (!hasSupabaseEnvironment()) {
    const data = readFallbackPlan(code);
    if (!data) {
      return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json(data);
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, code, title, meeting_date, participant_limit, status")
    .eq("code", code)
    .single();

  if (!plan) {
    return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
  }

  const { data: participants } = await supabase
    .from("participants")
    .select("id, name, departure_city_name, accepted_modes")
    .eq("plan_id", plan.id);
  const { data: currentSharedResults } = await supabase
    .from("recommendation_results")
    .select("id,run_id,city_code,explanation_zh,published_at")
    .eq("plan_id", plan.id)
    .eq("is_shared", true)
    .is("superseded_at", null)
    .limit(1);
  const currentShared = currentSharedResults?.[0] ?? null;
  const runQuery = supabase
    .from("recommendation_runs")
    .select("id, status, trace_id, retry_after, error_summary, started_at");
  const { data: runs } = currentShared
    ? await runQuery.eq("id", currentShared.run_id).limit(1)
    : await runQuery.eq("plan_id", plan.id).eq("kind", "automatic").order("started_at", { ascending: false }).limit(1);
  const latestRun = runs?.[0] ?? null;
  const { count: pendingGroups } = latestRun
    ? await supabase
      .from("route_tasks")
      .select("id", { count: "exact", head: true })
      .eq("run_id", latestRun.id)
      .in("status", ["pending", "running", "retryable_failure"])
    : { count: null };
  return NextResponse.json({
    plan: {
      code: plan.code,
      title: plan.title,
      meeting_date: plan.meeting_date,
      participant_limit: plan.participant_limit,
      status: plan.status,
    },
    participants: participants ?? [],
    latestRun: latestRun
      ? {
          status: latestRun.status,
          traceId: latestRun.trace_id,
          pendingGroups: pendingGroups ?? 0,
          retryAt: latestRun.retry_after,
          diagnosticCode: latestRun.error_summary,
        }
      : null,
    latestSharedResult: latestRun?.status === "completed" && currentShared
      ? {
          id: currentShared.id,
          city_code: currentShared.city_code,
          explanation_zh: currentShared.explanation_zh,
          published_at: currentShared.published_at,
        }
      : null,
  });
}
