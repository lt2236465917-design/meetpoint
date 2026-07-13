import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { RecommendationCard } from "@/components/result/RecommendationCard";
import { Notice } from "@/components/ui/Notice";
import { readFallbackResult } from "@/lib/fallback/mvp-store";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";

import type {
  TransportMode,
  TravelProviderName,
  TravelSource,
} from "@/types/domain";

type Recommendation = {
  id: string;
  city_code: string;
  city_name: string;
  total_price_cny: number;
  labels: string[];
  explanation: string | null;
  risk_summary: string | null;
  estimate_penalty: number;
  transfer_penalty: number;
  waiting_penalty: number;
  total_duration_minutes: number;
  fairness_gap: number;
  participant_options?: ParticipantTravelOption[];
};

type ParticipantTravelOption = {
  participant_name: string;
  departure_city_name: string;
  mode: TransportMode;
  price_cny: number | null;
  duration_minutes: number | null;
  depart_at: string | null;
  arrive_at: string | null;
  booking_url: string | null;
  service_name: string | null;
  source: TravelSource;
  provider: TravelProviderName;
  queried_at: string | null;
  failure_reason?: string | null;
};

export function ResultContent({
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
  const hasPrimary = hasPrimaryRecommendations(recommendations);

  return (
    <ResponsiveShell
      title={title}
      description="优先看前三个城市：均衡、费用和风险都放在同一张卡里。"
      backHref={`/p/${code}`}
      backLabel="返回计划页"
      aside={
        <p className="text-center text-xs text-gray-500">
          {isStale ? "票价可能已变化" : "结果仍可参考"}
        </p>
      }
    >
      <div className="space-y-4">
        {!hasRun && <Notice>还没有计算结果。</Notice>}
        {isStale && <Notice>票价可能已变化，建议重新计算。</Notice>}

        {hasRun && !hasPrimary && (
          <Notice>
            按当前到达时间，没有找到全员可行城市。请调整目标到达时间或会议日期后重新计算。
          </Notice>
        )}

        {hasPrimary && topRecommendations.length > 0 && (
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
          backHref="/"
          backLabel="返回首页"
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
        backHref="/"
        backLabel="返回首页"
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
  const { data: travelOptions } = run
    ? await supabase
        .from("travel_options")
        .select(
          "participant_id,candidate_city_code,mode,source,provider,queried_at,price_cny,depart_at,arrive_at,duration_minutes,booking_url,service_name,failure_reason,participants(name,departure_city_name)",
        )
        .eq("run_id", run.id)
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
      recommendations={attachParticipantOptions(
        recommendations ?? [],
        travelOptions ?? [],
      )}
    />
  );
}

function attachParticipantOptions(
  recommendations: Recommendation[],
  travelOptions: Array<{
    participant_id: string;
    candidate_city_code: string;
    mode: TransportMode;
    source: TravelSource;
    provider: TravelProviderName;
    queried_at: string | null;
    price_cny: number | null;
    depart_at: string | null;
    arrive_at: string | null;
    duration_minutes: number | null;
    booking_url: string | null;
    service_name: string | null;
    failure_reason?: string | null;
    participants?:
      | { name: string; departure_city_name: string }
      | Array<{ name: string; departure_city_name: string }>
      | null;
  }>,
) {
  return recommendations.map((recommendation) => ({
    ...recommendation,
    participant_options: selectParticipantOptions(
      travelOptions.filter(
        (option) => option.candidate_city_code === recommendation.city_code,
      ),
    ),
  }));
}

function selectParticipantOptions(
  options: Parameters<typeof attachParticipantOptions>[1],
): ParticipantTravelOption[] {
  const selected = new Map<string, (typeof options)[number]>();

  for (const option of options) {
    const existing = selected.get(option.participant_id);
    if (!existing || optionScore(option) < optionScore(existing)) {
      selected.set(option.participant_id, option);
    }
  }

  return Array.from(selected.values()).map((option) => {
    const participant = Array.isArray(option.participants)
      ? option.participants[0]
      : option.participants;
    return {
      participant_name: participant?.name ?? "参与者",
      departure_city_name: participant?.departure_city_name ?? "出发城市",
      mode: option.mode,
      price_cny: option.price_cny,
      duration_minutes: option.duration_minutes,
      depart_at: option.depart_at,
      arrive_at: option.arrive_at,
      booking_url: option.booking_url,
      service_name: option.service_name,
      source: option.source,
      provider: option.provider,
      queried_at: option.queried_at,
      failure_reason: option.failure_reason,
    };
  });
}

export function hasPrimaryRecommendations(
  recommendations: Pick<Recommendation, "labels">[],
) {
  return recommendations.some((recommendation) => recommendation.labels.length > 0);
}

function optionScore(option: {
  source: TravelSource;
  price_cny: number | null;
  duration_minutes: number | null;
}) {
  if (option.source === "unavailable") return 999_999;
  return (option.price_cny ?? 0) + (option.duration_minutes ?? 0);
}
