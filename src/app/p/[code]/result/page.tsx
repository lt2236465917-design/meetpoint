import { RecommendationCard } from "@/components/result/RecommendationCard";
import { Notice } from "@/components/ui/Notice";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export default async function ResultPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id,title")
    .eq("code", code)
    .single();

  if (!plan) return <main className="p-5">计划不存在</main>;

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
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold text-gray-950">{plan.title}</h1>

      {!run && (
        <div className="mt-4">
          <Notice>还没有计算结果。</Notice>
        </div>
      )}

      {isStale && (
        <div className="mt-4">
          <Notice>票价可能已变化，建议重新计算。</Notice>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {(recommendations ?? []).slice(0, 3).map((recommendation) => (
          <RecommendationCard
            recommendation={recommendation}
            key={recommendation.id}
          />
        ))}
      </div>
    </main>
  );
}
