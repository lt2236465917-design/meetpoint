import { NextResponse } from "next/server";
import { explainRecommendation } from "@/lib/ai/recommendation-explainer";
import { explainFallbackLatestRun } from "@/lib/fallback/mvp-store";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";
import type { CityRecommendation } from "@/types/domain";

type RecommendationRow = {
  id: string;
  city_code: string;
  city_name: string;
  total_price_cny: number;
  avg_price_cny: number;
  total_duration_minutes: number;
  fairness_gap: number;
  waiting_penalty: number;
  transfer_penalty: number;
  estimate_penalty: number;
  missing_penalty: number;
  score_cheapest: number;
  score_balanced: number;
  score_fastest: number;
  labels: CityRecommendation["labels"];
};

function toCityRecommendation(row: RecommendationRow): CityRecommendation {
  return {
    cityCode: row.city_code,
    cityName: row.city_name,
    totalPriceCny: row.total_price_cny,
    avgPriceCny: row.avg_price_cny,
    totalDurationMinutes: row.total_duration_minutes,
    fairnessGap: row.fairness_gap,
    waitingPenalty: row.waiting_penalty,
    transferPenalty: row.transfer_penalty,
    estimatePenalty: row.estimate_penalty,
    missingPenalty: row.missing_penalty,
    scoreCheapest: row.score_cheapest,
    scoreBalanced: row.score_balanced,
    scoreFastest: row.score_fastest,
    labels: row.labels,
  };
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;

  if (!hasSupabaseEnvironment()) {
    const result = await explainFallbackLatestRun(code);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }
    return NextResponse.json({ ok: true, count: result.count });
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("code", code)
    .single<{ id: string }>();

  if (!plan) {
    return NextResponse.json({ error: "PLAN_NOT_FOUND" }, { status: 404 });
  }

  const { data: run } = await supabase
    .from("recommendation_runs")
    .select("id")
    .eq("plan_id", plan.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .single<{ id: string }>();

  if (!run) {
    return NextResponse.json({ error: "RUN_NOT_FOUND" }, { status: 404 });
  }

  const { data: rows } = await supabase
    .from("city_recommendations")
    .select("*")
    .eq("run_id", run.id);
  const recommendations = (rows ?? []) as RecommendationRow[];

  for (const row of recommendations) {
    const explanation = await explainRecommendation(toCityRecommendation(row));
    await supabase
      .from("city_recommendations")
      .update({
        explanation: explanation.short_reason,
        risk_summary: explanation.risk_badges.join("、"),
      })
      .eq("id", row.id);
  }

  return NextResponse.json({ ok: true, count: recommendations.length });
}
