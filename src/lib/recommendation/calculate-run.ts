import { generateCandidateCities } from "@/lib/city/candidate-generator";
import { explainRecommendation } from "@/lib/ai/recommendation-explainer";
import { scoreCandidateCity } from "@/lib/recommendation/scoring";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { FlyAITravelProvider } from "@/lib/travel/flyai-provider";
import type { TravelOption } from "@/types/domain";

type PlanRow = {
  id: string;
  meeting_date: string;
  target_arrival_time: string;
};

type ParticipantRow = {
  id: string;
  departure_city_code: string;
  departure_city_name: string;
  accepted_modes: TravelOption["mode"][];
};

type CandidateCityRow = {
  city_code: string;
  source: "system" | "manual_add" | "manual_exclude";
  enabled: boolean;
};

function toTravelOptionInsert(runId: string, option: TravelOption) {
  return {
    run_id: runId,
    participant_id: option.participantId,
    candidate_city_code: option.candidateCityCode,
    mode: option.mode,
    source: option.source,
    provider: option.provider,
    price_cny: option.priceCny,
    depart_at: option.departAt,
    arrive_at: option.arriveAt,
    duration_minutes: option.durationMinutes,
    wait_minutes: option.waitMinutes,
    is_direct: option.isDirect,
    has_transfer: option.hasTransfer,
    transfer_count: option.transferCount,
    booking_url: option.bookingUrl,
    failure_reason: option.failureReason,
  };
}

export async function calculatePlanRecommendations({
  code,
}: {
  code: string;
}) {
  const supabase = createServiceSupabaseClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("*")
    .eq("code", code)
    .single<PlanRow>();

  if (!plan) {
    throw new Error("PLAN_NOT_FOUND");
  }

  const { data: participants } = await supabase
    .from("participants")
    .select("*")
    .eq("plan_id", plan.id);
  const participantRows = (participants ?? []) as ParticipantRow[];

  if (participantRows.length < 2) {
    throw new Error("NOT_ENOUGH_PARTICIPANTS");
  }

  const { data: manualCandidates } = await supabase
    .from("candidate_cities")
    .select("*")
    .eq("plan_id", plan.id);
  const candidateRows = (manualCandidates ?? []) as CandidateCityRow[];
  const manualAddCityCodes = candidateRows
    .filter((item) => item.source === "manual_add" && item.enabled)
    .map((item) => item.city_code);
  const manualExcludeCityCodes = candidateRows
    .filter((item) => item.source === "manual_exclude")
    .map((item) => item.city_code);
  const candidates = generateCandidateCities({
    departureCityCodes: participantRows.map((row) => row.departure_city_code),
    manualAddCityCodes,
    manualExcludeCityCodes,
    limit: 12,
  });

  const { data: run } = await supabase
    .from("recommendation_runs")
    .insert({ plan_id: plan.id, status: "running" })
    .select("id")
    .single<{ id: string }>();

  if (!run) {
    throw new Error("RUN_CREATE_FAILED");
  }

  const provider = new FlyAITravelProvider();
  const allOptions: TravelOption[] = [];

  for (const candidate of candidates) {
    for (const participant of participantRows) {
      const options = await provider.search({
        participantId: participant.id,
        originCityCode: participant.departure_city_code,
        originCityName: participant.departure_city_name,
        destinationCityCode: candidate.code,
        destinationCityName: candidate.name,
        meetingDate: plan.meeting_date,
        targetArrivalTime: plan.target_arrival_time,
        acceptedModes: participant.accepted_modes,
      });
      allOptions.push(...options);
    }
  }

  if (allOptions.length > 0) {
    await supabase
      .from("travel_options")
      .insert(allOptions.map((option) => toTravelOptionInsert(run.id, option)));
  }

  const recommendations = candidates.map((candidate) =>
    scoreCandidateCity({
      cityCode: candidate.code,
      cityName: candidate.name,
      options: allOptions.filter(
        (option) => option.candidateCityCode === candidate.code,
      ),
    }),
  );

  const recommendationInserts = await Promise.all(
    recommendations.map(async (item) => {
      const explanation = await explainRecommendation(item);
      return {
        run_id: run.id,
        city_code: item.cityCode,
        city_name: item.cityName,
        total_price_cny: item.totalPriceCny,
        avg_price_cny: item.avgPriceCny,
        total_duration_minutes: item.totalDurationMinutes,
        fairness_gap: item.fairnessGap,
        waiting_penalty: item.waitingPenalty,
        transfer_penalty: item.transferPenalty,
        estimate_penalty: item.estimatePenalty,
        missing_penalty: item.missingPenalty,
        score_cheapest: item.scoreCheapest,
        score_balanced: item.scoreBalanced,
        score_fastest: item.scoreFastest,
        labels: item.labels,
        explanation: explanation.short_reason,
        risk_summary: explanation.risk_badges.join("、"),
      };
    }),
  );
  await supabase.from("city_recommendations").insert(recommendationInserts);

  await supabase
    .from("recommendation_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      stale_after: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .eq("id", run.id);

  await supabase
    .from("plans")
    .update({
      status: "completed",
      last_calculated_at: new Date().toISOString(),
    })
    .eq("id", plan.id);

  return { runId: run.id, candidateCount: candidates.length };
}
