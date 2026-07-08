import Link from "next/link";
import { ParticipantList } from "@/components/plan/ParticipantList";
import { Notice } from "@/components/ui/Notice";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

async function getPlan(code: string) {
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
  if (!data) return <main className="p-5">计划不存在</main>;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold text-gray-950">
        {data.plan.title}
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        {data.plan.meeting_date} 到达 {data.plan.target_arrival_time}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2">
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

      <section className="mt-6">
        <h2 className="mb-3 font-medium text-gray-950">已填写的人</h2>
        {data.participants.length ? (
          <ParticipantList participants={data.participants} />
        ) : (
          <Notice>还没有人填写。</Notice>
        )}
      </section>

      {!data.latestRun && (
        <div className="mt-4">
          <Notice>发起人还没有开始计算。</Notice>
        </div>
      )}
    </main>
  );
}
