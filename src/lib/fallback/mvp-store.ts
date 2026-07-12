import { generateCandidateCities } from "@/lib/city/candidate-generator";
import { explainRecommendation } from "@/lib/ai/recommendation-explainer";
import {
  pickPrimaryRecommendations,
  scoreCandidateCity,
} from "@/lib/recommendation/scoring";
import { collectTravelOptions } from "@/lib/recommendation/travel-search";
import {
  generateToken,
  hashToken,
  verifyToken,
} from "@/lib/security/tokens";
import { FlyAITravelProvider } from "@/lib/travel/flyai-provider";
import type {
  CityRecommendation,
  TravelOption,
  TransportMode,
} from "@/types/domain";

type PlanRow = {
  id: string;
  code: string;
  title: string;
  meeting_date: string;
  target_arrival_time: string;
  participant_limit: number;
  status: "collecting" | "completed";
  created_at: string;
  updated_at: string;
  last_calculated_at: string | null;
};

type ParticipantRow = {
  id: string;
  plan_id: string;
  name: string;
  departure_city_code: string;
  departure_city_name: string;
  accepted_modes: TransportMode[];
  edit_token_hash: string;
  created_by_host: boolean;
  created_at: string;
  updated_at: string;
};

type CandidateCityRow = {
  id: string;
  plan_id: string;
  city_code: string;
  city_name: string;
  source: "manual_add" | "manual_exclude";
  enabled: boolean;
  created_at: string;
};

type RecommendationRunRow = {
  id: string;
  plan_id: string;
  status: "running" | "completed";
  started_at: string;
  completed_at: string | null;
  stale_after: string | null;
  error_summary: string | null;
};

type CityRecommendationRow = {
  id: string;
  run_id: string;
  city_code: string;
  city_name: string;
  total_price_cny: number;
  avg_price_cny: number;
  total_duration_minutes: number;
  fairness_gap: number;
  waiting_penalty: number;
  transfer_penalty: number;
  estimate_penalty: number;
  missing_penalty: number;
  score_cheapest: number;
  score_balanced: number;
  score_fastest: number;
  labels: CityRecommendation["labels"];
  explanation: string;
  risk_summary: string;
};

type StoreState = {
  plans: PlanRow[];
  participants: ParticipantRow[];
  candidates: CandidateCityRow[];
  runs: RecommendationRunRow[];
  travelOptions: Array<TravelOption & { id: string; run_id: string }>;
  recommendations: CityRecommendationRow[];
};

const globalKey = "__crossCityMeetpointFallbackStore";
const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: StoreState;
};

function state(): StoreState {
  globalStore[globalKey] ??= {
    plans: [],
    participants: [],
    candidates: [],
    runs: [],
    travelOptions: [],
    recommendations: [],
  };
  return globalStore[globalKey];
}

function now(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function publicPlan(plan: PlanRow) {
  return {
    id: plan.id,
    code: plan.code,
    title: plan.title,
    meeting_date: plan.meeting_date,
    target_arrival_time: plan.target_arrival_time,
    participant_limit: plan.participant_limit,
    status: plan.status,
    created_at: plan.created_at,
    updated_at: plan.updated_at,
    last_calculated_at: plan.last_calculated_at,
  };
}

export async function createFallbackPlan(input: {
  title: string;
  meetingDate: string;
  targetArrivalTime: string;
  participantLimit: number;
}) {
  const store = state();
  let code = generateCode();
  while (store.plans.some((plan) => plan.code === code)) {
    code = generateCode();
  }

  const timestamp = now();
  const plan: PlanRow = {
    id: id("plan"),
    code,
    title: input.title,
    meeting_date: input.meetingDate,
    target_arrival_time: input.targetArrivalTime,
    participant_limit: input.participantLimit,
    status: "collecting",
    created_at: timestamp,
    updated_at: timestamp,
    last_calculated_at: null,
  };
  store.plans.push(plan);

  return {
    code,
    shareUrl: `/p/${code}`,
  };
}

export function readFallbackPlan(code: string) {
  const store = state();
  const plan = store.plans.find((item) => item.code === code);
  if (!plan) return null;

  const runs = store.runs
    .filter((run) => run.plan_id === plan.id)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));

  return {
    plan: publicPlan(plan),
    participants: store.participants.filter(
      (participant) => participant.plan_id === plan.id,
    ),
    latestRun: runs[0] ?? null,
  };
}

export function readFallbackResult(code: string) {
  const data = readFallbackPlan(code);
  if (!data) return null;
  const store = state();
  const recommendations = data.latestRun
    ? store.recommendations
        .filter(
          (recommendation) => recommendation.run_id === data.latestRun?.id,
        )
        .sort((a, b) => a.score_balanced - b.score_balanced)
    : [];
  const participantById = new Map(
    store.participants.map((participant) => [participant.id, participant]),
  );
  const recommendationsWithOptions = recommendations.map((recommendation) => ({
    ...recommendation,
    participant_options: selectFallbackParticipantOptions(
      store.travelOptions.filter(
        (option) =>
          option.run_id === recommendation.run_id &&
          option.candidateCityCode === recommendation.city_code,
      ),
      participantById,
    ),
  }));

  return { ...data, recommendations: recommendationsWithOptions };
}

function selectFallbackParticipantOptions(
  options: Array<TravelOption & { id: string; run_id: string }>,
  participantById: Map<string, ParticipantRow>,
) {
  const selected = new Map<string, TravelOption & { id: string; run_id: string }>();

  for (const option of options) {
    const existing = selected.get(option.participantId);
    if (!existing || fallbackOptionScore(option) < fallbackOptionScore(existing)) {
      selected.set(option.participantId, option);
    }
  }

  return Array.from(selected.values()).map((option) => {
    const participant = participantById.get(option.participantId);
    return {
      participant_name: participant?.name ?? "参与者",
      departure_city_name: participant?.departure_city_name ?? "出发城市",
      mode: option.mode,
      price_cny: option.priceCny,
      duration_minutes: option.durationMinutes,
      depart_at: option.departAt,
      arrive_at: option.arriveAt,
      booking_url: option.bookingUrl,
      service_name: option.serviceName,
      source: option.source,
    };
  });
}

function fallbackOptionScore(option: TravelOption) {
  if (option.source === "unavailable") return 999_999;
  return (option.priceCny ?? 0) + (option.durationMinutes ?? 0);
}

export async function createFallbackParticipant(
  code: string,
  input: {
    name: string;
    departureCityCode: string;
    departureCityName: string;
    acceptedModes: TransportMode[];
  },
) {
  const store = state();
  const plan = store.plans.find((item) => item.code === code);
  if (!plan) return { ok: false as const, status: 404, error: "PLAN_NOT_FOUND" };

  const currentCount = store.participants.filter(
    (participant) => participant.plan_id === plan.id,
  ).length;
  if (currentCount >= plan.participant_limit) {
    return {
      ok: false as const,
      status: 409,
      error: "PARTICIPANT_LIMIT_REACHED",
    };
  }

  const editToken = generateToken();
  const timestamp = now();
  const participant: ParticipantRow = {
    id: id("participant"),
    plan_id: plan.id,
    name: input.name,
    departure_city_code: input.departureCityCode,
    departure_city_name: input.departureCityName,
    accepted_modes: input.acceptedModes,
    edit_token_hash: await hashToken(editToken),
    created_by_host: false,
    created_at: timestamp,
    updated_at: timestamp,
  };
  store.participants.push(participant);

  return {
    ok: true as const,
    participantId: participant.id,
    editToken,
  };
}

export async function verifyFallbackParticipantCanCalculate(
  code: string,
  token: string,
) {
  const plan = state().plans.find((item) => item.code === code);
  if (!plan) return { ok: false as const, status: 404, error: "PLAN_NOT_FOUND" };

  const participants = state().participants.filter(
    (participant) => participant.plan_id === plan.id,
  );
  if (participants.length < plan.participant_limit) {
    return {
      ok: false as const,
      status: 409,
      error: "PARTICIPANT_LIMIT_NOT_REACHED",
    };
  }

  for (const participant of participants) {
    if (await verifyToken(token, participant.edit_token_hash)) {
      return {
        ok: true as const,
        planId: plan.id,
        participantId: participant.id,
      };
    }
  }

  return {
    ok: false as const,
    status: 403,
    error: "INVALID_PARTICIPANT_TOKEN",
  };
}

export function readFallbackCandidates(code: string) {
  const plan = state().plans.find((item) => item.code === code);
  if (!plan) return null;
  return state().candidates.filter((candidate) => candidate.plan_id === plan.id);
}

export function saveFallbackCandidate(input: {
  planId: string;
  cityCode: string;
  cityName: string;
  enabled: boolean;
}) {
  const store = state();
  const source = input.enabled ? "manual_add" : "manual_exclude";
  const oppositeSource = input.enabled ? "manual_exclude" : "manual_add";
  store.candidates = store.candidates.filter(
    (candidate) =>
      !(
        candidate.plan_id === input.planId &&
        candidate.city_code === input.cityCode &&
        candidate.source === oppositeSource
      ),
  );

  const existing = store.candidates.find(
    (candidate) =>
      candidate.plan_id === input.planId &&
      candidate.city_code === input.cityCode &&
      candidate.source === source,
  );

  if (existing) {
    existing.city_name = input.cityName;
    existing.enabled = input.enabled;
    return;
  }

  store.candidates.push({
    id: id("candidate"),
    plan_id: input.planId,
    city_code: input.cityCode,
    city_name: input.cityName,
    source,
    enabled: input.enabled,
    created_at: now(),
  });
}

export async function calculateFallbackRecommendations(code: string) {
  const store = state();
  const plan = store.plans.find((item) => item.code === code);
  if (!plan) throw new Error("PLAN_NOT_FOUND");

  const participants = store.participants.filter(
    (participant) => participant.plan_id === plan.id,
  );
  if (participants.length < 2) throw new Error("NOT_ENOUGH_PARTICIPANTS");

  const candidateRows = store.candidates.filter(
    (candidate) => candidate.plan_id === plan.id,
  );
  const candidates = generateCandidateCities({
    departureCityCodes: participants.map(
      (participant) => participant.departure_city_code,
    ),
    manualAddCityCodes: candidateRows
      .filter((item) => item.source === "manual_add" && item.enabled)
      .map((item) => item.city_code),
    manualExcludeCityCodes: candidateRows
      .filter((item) => item.source === "manual_exclude")
      .map((item) => item.city_code),
    limit: 12,
  });

  const run: RecommendationRunRow = {
    id: id("run"),
    plan_id: plan.id,
    status: "running",
    started_at: now(),
    completed_at: null,
    stale_after: null,
    error_summary: null,
  };
  store.runs.push(run);

  const { options: allOptions, usedFallback } = await collectTravelOptions({
    participants: participants.map((participant) => ({
      id: participant.id,
      departureCityCode: participant.departure_city_code,
      departureCityName: participant.departure_city_name,
      acceptedModes: participant.accepted_modes,
    })),
    candidates,
    meetingDate: plan.meeting_date,
    targetArrivalTime: plan.target_arrival_time,
    provider: new FlyAITravelProvider(),
  });

  store.travelOptions.push(
    ...allOptions.map((option) => ({
      ...option,
      id: id("travel"),
      run_id: run.id,
    })),
  );

  const scoredRecommendations = candidates.map((candidate) =>
    scoreCandidateCity({
      cityCode: candidate.code,
      cityName: candidate.name,
      options: allOptions.filter(
        (option) => option.candidateCityCode === candidate.code,
      ),
    }),
  );
  const primaryByCityCode = new Map(
    pickPrimaryRecommendations(scoredRecommendations).map((item) => [
      item.cityCode,
      item,
    ]),
  );
  const labeledRecommendations = scoredRecommendations.map(
    (recommendation) =>
      primaryByCityCode.get(recommendation.cityCode) ?? recommendation,
  );

  const recommendations = await Promise.all(
    labeledRecommendations.map(async (scored) => {
      const explanation = await explainRecommendation(scored);

      return {
        id: id("recommendation"),
        run_id: run.id,
        city_code: scored.cityCode,
        city_name: scored.cityName,
        total_price_cny: scored.totalPriceCny,
        avg_price_cny: scored.avgPriceCny,
        total_duration_minutes: scored.totalDurationMinutes,
        fairness_gap: scored.fairnessGap,
        waiting_penalty: scored.waitingPenalty,
        transfer_penalty: scored.transferPenalty,
        estimate_penalty: scored.estimatePenalty,
        missing_penalty: scored.missingPenalty,
        score_cheapest: scored.scoreCheapest,
        score_balanced: scored.scoreBalanced,
        score_fastest: scored.scoreFastest,
        labels: scored.labels,
        explanation: explanation.short_reason,
        risk_summary: explanation.risk_badges.join("、"),
      };
    }),
  );
  store.recommendations.push(...recommendations);

  const timestamp = now();
  run.status = "completed";
  run.completed_at = timestamp;
  run.stale_after = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  run.error_summary = usedFallback ? "PARTIAL_ESTIMATE_FALLBACK" : null;
  plan.status = "completed";
  plan.last_calculated_at = timestamp;
  plan.updated_at = timestamp;

  return { runId: run.id, candidateCount: candidates.length };
}

function toCityRecommendation(row: CityRecommendationRow): CityRecommendation {
  return {
    cityCode: row.city_code,
    cityName: row.city_name,
    totalPriceCny: row.total_price_cny,
    avgPriceCny: row.avg_price_cny,
    totalDurationMinutes: row.total_duration_minutes,
    fairnessGap: row.fairness_gap,
    waitingPenalty: row.waiting_penalty,
    transferPenalty: row.transfer_penalty,
    estimatePenalty: row.estimate_penalty,
    missingPenalty: row.missing_penalty,
    scoreCheapest: row.score_cheapest,
    scoreBalanced: row.score_balanced,
    scoreFastest: row.score_fastest,
    labels: row.labels,
  };
}

export async function explainFallbackLatestRun(code: string) {
  const store = state();
  const plan = store.plans.find((item) => item.code === code);
  if (!plan) return { ok: false as const, status: 404, error: "PLAN_NOT_FOUND" };

  const run = store.runs
    .filter((item) => item.plan_id === plan.id)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  if (!run) return { ok: false as const, status: 404, error: "RUN_NOT_FOUND" };

  const recommendations = store.recommendations.filter(
    (recommendation) => recommendation.run_id === run.id,
  );

  for (const recommendation of recommendations) {
    const explanation = await explainRecommendation(
      toCityRecommendation(recommendation),
    );
    recommendation.explanation = explanation.short_reason;
    recommendation.risk_summary = explanation.risk_badges.join("、");
  }

  return { ok: true as const, count: recommendations.length };
}
