import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import {
  RefreshingResultNotice,
  type PublicRunProgress,
} from "@/components/result/RefreshingResultNotice";
import {
  SharedRecommendation,
  type SharedResult,
} from "@/components/result/SharedRecommendation";
import { Notice } from "@/components/ui/Notice";
import { findCityByCode } from "@/data/cities";
import { runStatusSchema } from "@/lib/agent/contracts";
import { readFallbackResult } from "@/lib/fallback/mvp-store";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";
import type { TransportMode } from "@/types/domain";

type Relation<T> = T | T[] | null;

type ResultRow = {
  id: string;
  city_code: string;
  explanation_zh: string;
  published_at: string;
};

type SchemeRow = {
  id: string;
  kind: "saving" | "fast";
  total_fare_cny: number;
  total_duration_minutes: number;
  latest_arrival_at: string;
  team_transfer_count: number;
};

type RouteRow = {
  scheme_id: string;
  participant_id: string;
  participants: Relation<{
    name: string;
    departure_city_name: string;
  }>;
  verified_quotes: Relation<{
    quote_id: string;
    mode: TransportMode;
    provider: string;
    queried_at: string;
    price_cny: number;
    depart_at: string;
    arrive_at: string;
    duration_minutes: number;
    transfer_count: number;
    service_name: string;
    departure_station_name: string | null;
    arrival_station_name: string | null;
  }>;
};

export function ResultContent({
  code,
  title,
  progress,
  result,
  now,
}: {
  code: string;
  title: string;
  progress: PublicRunProgress | null;
  result: SharedResult | null;
  now?: Date;
}) {
  const completed = progress?.status === "completed";

  return (
    <ResponsiveShell
      title={title}
      description="一个推荐城市，两套全员可核验的出行方案。"
      backHref={`/p/${code}`}
      backLabel="返回计划页"
      aside={
        <p className="text-center text-xs text-gray-500">
          {completed ? "结果来自已核验的真实票价" : "结果生成后才会公开方案"}
        </p>
      }
    >
      <div className="space-y-4">
        {!progress ? <Notice>还没有计算结果。</Notice> : null}
        {progress && !completed ? (
          <RefreshingResultNotice progress={progress} now={now} />
        ) : null}
        {completed && result ? <SharedRecommendation result={result} /> : null}
        {completed && !result ? (
          <Notice>结果数据不完整，请返回计划页重新计算。</Notice>
        ) : null}
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
  const data = await loadResultPageData(code);

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
    <ResultContent
      code={code}
      title={data.title}
      progress={data.progress}
      result={data.result}
    />
  );
}

async function loadResultPageData(code: string) {
  if (!hasSupabaseEnvironment()) {
    const data = readFallbackResult(code);
    return data
      ? { title: data.plan.title, progress: data.latestRun, result: data.latestSharedResult }
      : null;
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id,title")
    .eq("code", code)
    .single();
  if (!plan) return null;

  const { data: sharedResults } = await supabase
    .from("recommendation_results")
    .select("run_id")
    .eq("plan_id", plan.id)
    .eq("is_shared", true)
    .is("superseded_at", null)
    .limit(1);
  const sharedRunId = sharedResults?.[0]?.run_id;
  const runQuery = supabase
    .from("recommendation_runs")
    .select("id,status,trace_id,retry_after,error_summary,started_at");
  const { data: runs } = sharedRunId
    ? await runQuery.eq("id", sharedRunId).limit(1)
    : await runQuery.eq("plan_id", plan.id).eq("kind", "automatic").order("started_at", { ascending: false }).limit(1);
  const run = runs?.[0] ?? null;
  const parsedStatus = runStatusSchema.safeParse(run?.status);
  if (!run || !parsedStatus.success) {
    return { title: plan.title, progress: null, result: null };
  }

  const { count: pendingGroups } = await supabase
    .from("route_tasks")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .in("status", ["pending", "running", "retryable_failure"]);
  const progress: PublicRunProgress = {
    runId: run.id,
    status: parsedStatus.data,
    traceId: run.trace_id,
    pendingGroups: pendingGroups ?? 0,
    retryAt: run.retry_after,
    diagnosticCode: run.error_summary,
  };
  const result = progress.status === "completed"
    ? await loadSharedResult(run.id)
    : null;

  return { title: plan.title, progress, result };
}

async function loadSharedResult(runId: string): Promise<SharedResult | null> {
  const supabase = createServiceSupabaseClient();
  const { data: resultRows } = await supabase
    .from("recommendation_results")
    .select("id,city_code,explanation_zh,published_at")
    .eq("run_id", runId)
    .eq("is_shared", true)
    .limit(1);
  const result = resultRows?.[0] as ResultRow | undefined;
  if (!result) return null;

  const { data: rawSchemes } = await supabase
    .from("recommendation_schemes")
    .select("id,kind,total_fare_cny,total_duration_minutes,latest_arrival_at,team_transfer_count")
    .eq("result_id", result.id)
    .order("kind", { ascending: false });
  const schemes = (rawSchemes ?? []) as SchemeRow[];
  if (schemes.length !== 2) return null;

  const { data: rawRoutes } = await supabase
    .from("recommendation_scheme_routes")
    .select("scheme_id,participant_id,participants(name,departure_city_name),verified_quotes(quote_id,mode,provider,queried_at,price_cny,depart_at,arrive_at,duration_minutes,transfer_count,service_name,departure_station_name,arrival_station_name)")
    .in("scheme_id", schemes.map((scheme) => scheme.id));
  const routes = (rawRoutes ?? []) as unknown as RouteRow[];
  const cityName = findCityByCode(result.city_code)?.name ?? result.city_code;

  return {
    id: result.id,
    cityCode: result.city_code,
    cityName,
    explanationZh: result.explanation_zh,
    publishedAt: result.published_at,
    schemes: schemes.map((scheme) => ({
      id: scheme.id,
      kind: scheme.kind,
      totalFareCny: scheme.total_fare_cny,
      totalDurationMinutes: scheme.total_duration_minutes,
      latestArrivalAt: scheme.latest_arrival_at,
      teamTransferCount: scheme.team_transfer_count,
      routes: routes
        .filter((route) => route.scheme_id === scheme.id)
        .map((route) => {
          const participant = firstRelation(route.participants);
          const quote = firstRelation(route.verified_quotes);
          if (!participant || !quote) return null;
          return {
            participantId: route.participant_id,
            participantName: participant.name,
            departureCityName: participant.departure_city_name,
            quoteId: quote.quote_id,
            mode: quote.mode,
            provider: quote.provider,
            queriedAt: quote.queried_at,
            priceCny: quote.price_cny,
            departAt: quote.depart_at,
            arriveAt: quote.arrive_at,
            durationMinutes: quote.duration_minutes,
            transferCount: quote.transfer_count,
            serviceName: quote.service_name,
            departureStationName: quote.departure_station_name,
            arrivalStationName: quote.arrival_station_name,
          };
        })
        .filter((route): route is NonNullable<typeof route> => route !== null),
    })),
  };
}

function firstRelation<T>(relation: Relation<T>) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}
