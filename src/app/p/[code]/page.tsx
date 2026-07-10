import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { PublicPlanContent } from "@/components/plan/PublicPlanContent";
import { Notice } from "@/components/ui/Notice";
import { readFallbackPlan } from "@/lib/fallback/mvp-store";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";

async function getPlan(code: string) {
  if (!hasSupabaseEnvironment()) {
    return readFallbackPlan(code);
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("code", code)
    .single();

  if (!plan) return null;

  const { data: participants } = await supabase
    .from("participants")
    .select("*")
    .eq("plan_id", plan.id);
  const { data: runs } = await supabase
    .from("recommendation_runs")
    .select("*")
    .eq("plan_id", plan.id)
    .order("started_at", { ascending: false })
    .limit(1);

  return {
    plan,
    participants: participants ?? [],
    latestRun: runs?.[0] ?? null,
  };
}

export default async function PublicPlanPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const data = await getPlan(code);
  if (!data) {
    return (
      <ResponsiveShell
        title="计划不存在"
        description="这个计划可能已失效，或链接里的计划码不正确。"
        backHref="/"
        backLabel="返回首页"
      >
        <Notice>请让发起人重新确认公开链接。</Notice>
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      title={data.plan.title}
      description={`${data.plan.meeting_date} 到达 ${data.plan.target_arrival_time}`}
      backHref="/"
      backLabel="返回首页"
    >
      <PublicPlanContent code={code} initialData={data} />
    </ResponsiveShell>
  );
}
