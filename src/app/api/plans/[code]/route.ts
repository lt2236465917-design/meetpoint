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
  const { data: runs } = await supabase
    .from("recommendation_runs")
    .select("status, started_at")
    .eq("plan_id", plan.id)
    .order("started_at", { ascending: false })
    .limit(1);

  return NextResponse.json({
    plan: {
      code: plan.code,
      title: plan.title,
      meeting_date: plan.meeting_date,
      participant_limit: plan.participant_limit,
      status: plan.status,
    },
    participants: participants ?? [],
    latestRun: runs?.[0] ? { status: runs[0].status } : null,
  });
}
