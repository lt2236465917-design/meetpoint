import Link from "next/link";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { ParticipantList } from "@/components/plan/ParticipantList";
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
      >
        <Notice>请让发起人重新确认公开链接。</Notice>
      </ResponsiveShell>
    );
  }

  return (
    <ResponsiveShell
      title={data.plan.title}
      description={`${data.plan.meeting_date} 到达 ${data.plan.target_arrival_time}`}
      aside={
        <p className="text-center text-xs leading-5 text-gray-500">
          已填写 {data.participants.length} 人 ·{" "}
          {data.latestRun ? "已有结果" : "等待发起人计算"}
        </p>
      }
    >
      <div className="space-y-5">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-medium text-gray-950">下一步</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              className="rounded-lg bg-black py-3 text-center font-medium text-white"
              href={`/p/${code}/join`}
            >
              填写我的信息
            </Link>
            <Link
              className="rounded-lg border border-gray-200 py-3 text-center font-medium text-gray-950"
              href={`/p/${code}/result`}
            >
              看结果
            </Link>
          </div>
          {!data.latestRun && (
            <div className="mt-4">
              <Notice>发起人还没有开始计算。</Notice>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-medium text-gray-950">已填写的人</h2>
          {data.participants.length ? (
            <ParticipantList participants={data.participants} />
          ) : (
            <Notice>还没有人填写。</Notice>
          )}
        </section>
      </div>
    </ResponsiveShell>
  );
}
