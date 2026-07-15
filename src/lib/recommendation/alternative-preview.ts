import { findCityByCode } from "@/data/cities";
import { ManagerAgent } from "@/lib/agent/manager-agent";
import { runStatusSchema, type RunStatus } from "@/lib/agent/contracts";
import {
  createFallbackAlternativePreview,
  readFallbackPrivatePreview,
} from "@/lib/fallback/mvp-store";
import { SupabaseRecommendationRepository } from "@/lib/recommendation/repository";
import { verifyParticipantCanCalculatePlan } from "@/lib/security/participant-calculation";
import { verifyToken } from "@/lib/security/tokens";
import {
  createServiceSupabaseClient,
  hasSupabaseEnvironment,
} from "@/lib/supabase/server";
import type { SharedResult } from "@/components/result/SharedRecommendation";
import type { TransportMode } from "@/types/domain";

export type AlternativePreviewData = {
  runId: string;
  status: RunStatus;
  traceId?: string;
  pendingGroups?: number;
  retryAt?: string | null;
  diagnosticCode?: string | null;
  result: SharedResult | null;
};

export async function createAlternativePreview(input: {
  code: string;
  participantToken: string;
  cityCode: string;
  cityName: string;
}): Promise<{ runId: string; status: "pending" }> {
  const city = findCityByCode(input.cityCode);
  if (!city || city.name !== input.cityName) throw new Error("UNSUPPORTED_CITY");
  const verified = await verifyParticipantCanCalculatePlan({
    code: input.code,
    participantToken: input.participantToken,
  });
  if (!verified.ok) throw new Error(verified.error);
  if (!hasSupabaseEnvironment()) {
    return createFallbackAlternativePreview({
      code: input.code,
      participantToken: input.participantToken,
      cityCode: city.code,
    });
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id,meeting_date")
    .eq("id", verified.planId)
    .eq("code", input.code)
    .single();
  if (planError || !plan) throw new Error("PLAN_NOT_FOUND");
  const { data: participants, error: participantsError } = await supabase
    .from("participants")
    .select("id,departure_city_code,departure_city_name,accepted_modes")
    .eq("plan_id", plan.id)
    .order("id", { ascending: true });
  if (participantsError || !participants || participants.length < 2) {
    throw new Error("NOT_ENOUGH_PARTICIPANTS");
  }

  try {
    const manager = new ManagerAgent(new SupabaseRecommendationRepository());
    const prepared = await manager.prepare({
      planId: plan.id,
      arrivalDate: plan.meeting_date,
      participants: participants.map((participant) => ({
        id: participant.id,
        departureCityCode: participant.departure_city_code,
        departureCityName: participant.departure_city_name,
        acceptedModes: participant.accepted_modes,
      })),
      alternative: {
        cityCode: city.code,
        cityName: city.name,
        requestedByParticipantId: verified.participantId,
      },
    });
    return { runId: prepared.runId, status: "pending" };
  } catch (error) {
    if (error instanceof Error && /duplicate key|unique/i.test(error.message)) {
      throw new Error("CALCULATION_IN_PROGRESS");
    }
    throw error;
  }
}

export async function readAlternativePreview(input: {
  code: string;
  runId: string;
  participantToken: string | null;
  hostToken: string | null;
}): Promise<AlternativePreviewData | null> {
  if (!hasSupabaseEnvironment()) {
    const preview = await readFallbackPrivatePreview({
      code: input.code,
      runId: input.runId,
      participantToken: input.participantToken,
      hostToken: input.hostToken,
    });
    if (!preview) return null;
    return {
      runId: preview.runId,
      status: preview.status,
      result: preview.result as SharedResult | null,
    };
  }

  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase.from("plans").select("id").eq("code", input.code).single();
  if (!plan) return null;
  const { data: run } = await supabase
    .from("recommendation_runs")
    .select("id,plan_id,status,trace_id,retry_after,error_summary,kind,requested_by_participant_id")
    .eq("id", input.runId)
    .eq("plan_id", plan.id)
    .single();
  const status = runStatusSchema.safeParse(run?.status);
  if (!run || run.kind !== "alternative" || !run.requested_by_participant_id || !status.success) return null;

  const [participantAllowed, hostAllowed] = await Promise.all([
    verifyParticipantCredential(run.requested_by_participant_id, input.participantToken),
    verifyHostCredential(plan.id, input.hostToken),
  ]);
  if (!participantAllowed && !hostAllowed) return null;

  const { count: pendingGroups } = await supabase
    .from("route_tasks")
    .select("id", { count: "exact", head: true })
    .eq("run_id", run.id)
    .in("status", ["pending", "running", "retryable_failure"]);
  return {
    runId: run.id,
    status: status.data,
    traceId: run.trace_id,
    pendingGroups: pendingGroups ?? 0,
    retryAt: run.retry_after,
    diagnosticCode: run.error_summary,
    result: await loadPrivateResult(run.id),
  };
}

async function verifyParticipantCredential(participantId: string, token: string | null) {
  if (!token?.trim()) return false;
  const { data } = await createServiceSupabaseClient()
    .from("participant_credentials")
    .select("edit_token_hash")
    .eq("participant_id", participantId)
    .single();
  return Boolean(data && await verifyToken(token, data.edit_token_hash));
}

async function verifyHostCredential(planId: string, token: string | null) {
  if (!token?.trim()) return false;
  const { data } = await createServiceSupabaseClient()
    .from("plan_credentials")
    .select("host_token_hash")
    .eq("plan_id", planId)
    .single();
  return Boolean(data && await verifyToken(token, data.host_token_hash));
}

async function loadPrivateResult(runId: string): Promise<SharedResult | null> {
  const supabase = createServiceSupabaseClient();
  const { data: resultRows } = await supabase
    .from("recommendation_results")
    .select("id,city_code,explanation_zh,published_at")
    .eq("run_id", runId)
    .limit(1);
  const result = resultRows?.[0];
  if (!result) return null;
  const { data: schemes } = await supabase
    .from("recommendation_schemes")
    .select("id,kind,total_fare_cny,total_duration_minutes,latest_arrival_at,team_transfer_count")
    .eq("result_id", result.id)
    .order("kind", { ascending: false });
  if (!schemes || schemes.length !== 2) return null;
  const { data: rawRoutes } = await supabase
    .from("recommendation_scheme_routes")
    .select("scheme_id,participant_id,participants(name,departure_city_name),verified_quotes(quote_id,mode,provider,queried_at,price_cny,depart_at,arrive_at,duration_minutes,transfer_count,service_name,departure_station_name,arrival_station_name)")
    .in("scheme_id", schemes.map((scheme) => scheme.id));
  const routes = (rawRoutes ?? []) as unknown as Array<{
    scheme_id: string;
    participant_id: string;
    participants: { name: string; departure_city_name: string } | Array<{ name: string; departure_city_name: string }> | null;
    verified_quotes: {
      quote_id: string; mode: TransportMode; provider: string; queried_at: string; price_cny: number;
      depart_at: string; arrive_at: string; duration_minutes: number; transfer_count: number;
      service_name: string; departure_station_name: string | null; arrival_station_name: string | null;
    } | Array<{
      quote_id: string; mode: TransportMode; provider: string; queried_at: string; price_cny: number;
      depart_at: string; arrive_at: string; duration_minutes: number; transfer_count: number;
      service_name: string; departure_station_name: string | null; arrival_station_name: string | null;
    }> | null;
  }>;
  return {
    id: result.id,
    cityCode: result.city_code,
    cityName: findCityByCode(result.city_code)?.name ?? result.city_code,
    explanationZh: result.explanation_zh,
    publishedAt: result.published_at ?? "",
    schemes: schemes.map((scheme) => ({
      id: scheme.id,
      kind: scheme.kind as "saving" | "fast",
      totalFareCny: scheme.total_fare_cny,
      totalDurationMinutes: scheme.total_duration_minutes,
      latestArrivalAt: scheme.latest_arrival_at,
      teamTransferCount: scheme.team_transfer_count,
      routes: routes.filter((route) => route.scheme_id === scheme.id).flatMap((route) => {
        const participant = first(route.participants);
        const quote = first(route.verified_quotes);
        return participant && quote ? [{
          participantId: route.participant_id, participantName: participant.name,
          departureCityName: participant.departure_city_name, quoteId: quote.quote_id,
          mode: quote.mode, provider: quote.provider, queriedAt: quote.queried_at,
          priceCny: quote.price_cny, departAt: quote.depart_at, arriveAt: quote.arrive_at,
          durationMinutes: quote.duration_minutes, transferCount: quote.transfer_count,
          serviceName: quote.service_name, departureStationName: quote.departure_station_name,
          arrivalStationName: quote.arrival_station_name,
        }] : [];
      }),
    })),
  };
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}
