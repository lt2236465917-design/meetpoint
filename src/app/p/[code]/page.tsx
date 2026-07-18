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
    .select("id, code, title, meeting_date, participant_limit, status")
    .eq("code", code)
    .single();

  if (!plan) return null;

  const { data: participants } = await supabase
    .from("participants")
    .select("id, name, departure_city_name, accepted_modes")
    .eq("plan_id", plan.id);
  const { data: runs } = await supabase
    .from("recommendation_runs")
    .select("id,status,trace_id,retry_after,error_summary,started_at")
    .eq("plan_id", plan.id)
    .order("started_at", { ascending: false })
    .limit(1);
  const latestRun = runs?.[0] ?? null;
  const { count: pendingGroups } = latestRun
    ? await supabase
        .from("route_tasks")
        .select("id", { count: "exact", head: true })
        .eq("run_id", latestRun.id)
        .in("status", ["pending", "running", "retryable_failure"])
    : { count: null };

  return {
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
          runId: latestRun.id,
          status: latestRun.status,
          traceId: latestRun.trace_id,
          pendingGroups: pendingGroups ?? 0,
          retryAt: latestRun.retry_after,
          diagnosticCode: latestRun.error_summary,
        }
      : null,
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
        scenic
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
      scenic
      title={data.plan.title}
      description={`${data.plan.meeting_date} 到达`}
      backHref="/"
      backLabel="返回首页"
    >
      <PublicPlanContent code={code} initialData={data} />
    </ResponsiveShell>
  );
}
