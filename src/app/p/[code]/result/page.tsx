import Link from "next/link";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { RecommendationCard } from "@/components/result/RecommendationCard";
import { Notice } from "@/components/ui/Notice";
import { readFallbackResult } from "@/lib/fallback/mvp-store";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";

type Recommendation = {
  id: string;
  city_name: string;
  total_price_cny: number;
  avg_price_cny: number;
  labels: string[];
  explanation: string | null;
  risk_summary: string | null;
  estimate_penalty: number;
  transfer_penalty: number;
  waiting_penalty: number;
};

function ResultContent({
  code,
  title,
  hasRun,
  isStale,
  recommendations,
}: {
  code: string;
  title: string;
  hasRun: boolean;
  isStale: boolean;
  recommendations: Recommendation[];
}) {
  const topRecommendations = recommendations.slice(0, 3);

  return (
    <ResponsiveShell
      title={title}
      description="优先看前三个城市：均衡、费用和风险都放在同一张卡里。"
      aside={
        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>{isStale ? "票价可能已变化" : "结果仍可参考"}</span>
          <Link className="font-medium text-gray-700" href={`/p/${code}`}>
            返回计划页
          </Link>
        </div>
      }
    >
      <div className="space-y-4">
        {!hasRun && <Notice>还没有计算结果。</Notice>}
        {isStale && <Notice>票价可能已变化，建议重新计算。</Notice>}

        {topRecommendations.length > 0 && (
          <div className="grid gap-4">
            {topRecommendations.map((recommendation) => (
              <RecommendationCard
                recommendation={recommendation}
                key={recommendation.id}
              />
            ))}
          </div>
        )}
      </div>
    </ResponsiveShell>
  );
}

export default async function ResultPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  if (!hasSupabaseEnvironment()) {
    const data = readFallbackResult(code);
    if (!data) {
      return (
        <ResponsiveShell
          title="计划不存在"
          description="这个计划可能已失效，或链接里的计划码不正确。"
        >
          <Notice>请让发起人重新确认公开链接。</Notice>
        </ResponsiveShell>
      );
    }
    const staleAfter = data.latestRun?.stale_after;
    const isStale =
      typeof staleAfter === "string" &&
      new Date(staleAfter).getTime() < new Date().getTime();

    return (
      <ResultContent
        code={code}
        title={data.plan.title}
        hasRun={Boolean(data.latestRun)}
        isStale={isStale}
        recommendations={data.recommendations}
      />
    );
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id,title")
    .eq("code", code)
    .single();

  if (!plan) {
    return (
      <ResponsiveShell
        title="计划不存在"
        description="这个计划可能已失效，或链接里的计划码不正确。"
      >
        <Notice>请让发起人重新确认公开链接。</Notice>
      </ResponsiveShell>
    );
  }

  const { data: runs } = await supabase
    .from("recommendation_runs")
    .select("*")
    .eq("plan_id", plan.id)
    .order("started_at", { ascending: false })
    .limit(1);
  const run = runs?.[0] ?? null;
  const { data: recommendations } = run
    ? await supabase
        .from("city_recommendations")
        .select("*")
        .eq("run_id", run.id)
        .order("score_balanced", { ascending: true })
    : { data: [] };
  const isStale =
    Boolean(run?.stale_after) &&
    new Date(run.stale_after).getTime() < new Date().getTime();

  return (
    <ResultContent
      code={code}
      title={plan.title}
      hasRun={Boolean(run)}
      isStale={isStale}
      recommendations={recommendations ?? []}
    />
  );
}
