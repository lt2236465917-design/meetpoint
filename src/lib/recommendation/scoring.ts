import type {
  CityRecommendation,
  SelectedParticipantTravelOption,
  TravelOption,
} from "@/types/domain";

export type ScoreCandidateCityInput = {
  cityCode: string;
  cityName: string;
  options: TravelOption[];
};

function valueOrZero(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function scoreCandidateCity(
  input: ScoreCandidateCityInput,
): CityRecommendation {
  const selectedOptions = selectBestOptionPerParticipant(input.options);
  const usableOptions = selectedOptions.filter(
    (option) => option.source !== "unavailable",
  );
  const prices = usableOptions.map((option) => valueOrZero(option.priceCny));
  const durations = usableOptions.map((option) =>
    valueOrZero(option.durationMinutes),
  );
  const totalPriceCny = prices.reduce((sum, value) => sum + value, 0);
  const totalDurationMinutes = durations.reduce(
    (sum, value) => sum + value,
    0,
  );
  const avgPriceCny = usableOptions.length
    ? Math.round(totalPriceCny / usableOptions.length)
    : 0;
  const fairnessGap = prices.length ? Math.max(...prices) - Math.min(...prices) : 9999;
  const waitingPenalty = selectedOptions.reduce((sum, option) => {
    const wait = option.waitMinutes ?? 0;
    if (wait <= 360) return sum;
    if (wait <= 720) return sum + Math.round((wait - 360) / 10);
    return sum + 9999;
  }, 0);
  const transferPenalty = selectedOptions.reduce(
    (sum, option) =>
      sum + (option.hasTransfer ? 120 * Math.max(1, option.transferCount) : 0),
    0,
  );
  const estimatePenalty = selectedOptions.reduce(
    (sum, option) => sum + (option.source === "estimated" ? 200 : 0),
    0,
  );
  const missingPenalty = selectedOptions.reduce(
    (sum, option) => sum + (option.source === "unavailable" ? 9999 : 0),
    0,
  );

  return {
    cityCode: input.cityCode,
    cityName: input.cityName,
    totalPriceCny,
    avgPriceCny,
    totalDurationMinutes,
    fairnessGap,
    waitingPenalty,
    transferPenalty,
    estimatePenalty,
    missingPenalty,
    scoreCheapest:
      totalPriceCny + estimatePenalty + transferPenalty + missingPenalty,
    scoreBalanced:
      totalPriceCny +
      fairnessGap * 3 +
      waitingPenalty +
      transferPenalty +
      estimatePenalty +
      missingPenalty,
    scoreFastest:
      totalDurationMinutes +
      waitingPenalty * 2 +
      transferPenalty +
      estimatePenalty +
      missingPenalty,
    labels: [],
    selectedOptions,
  };
}

function selectBestOptionPerParticipant(
  options: TravelOption[],
): SelectedParticipantTravelOption[] {
  const byParticipant = new Map<string, SelectedParticipantTravelOption>();

  for (const option of options) {
    const candidate = {
      ...option,
      selectionScore: optionSelectionScore(option),
    };
    const existing = byParticipant.get(option.participantId);
    if (!existing || candidate.selectionScore < existing.selectionScore) {
      byParticipant.set(option.participantId, candidate);
    }
  }

  return Array.from(byParticipant.values());
}

function optionSelectionScore(option: TravelOption): number {
  if (option.source === "unavailable") return 999_999;
  const price = valueOrZero(option.priceCny);
  const duration = valueOrZero(option.durationMinutes);
  const estimatePenalty = option.source === "estimated" ? 200 : 0;
  const transferPenalty = option.hasTransfer
    ? 120 * Math.max(1, option.transferCount)
    : 0;
  return price + duration + estimatePenalty + transferPenalty;
}

export function pickPrimaryRecommendations(
  recommendations: CityRecommendation[],
): CityRecommendation[] {
  const eligible = recommendations.filter((item) => item.missingPenalty === 0);
  const cheapest = [...eligible].sort(
    (a, b) => a.scoreCheapest - b.scoreCheapest,
  )[0];
  const balanced = [...eligible].sort(
    (a, b) => a.scoreBalanced - b.scoreBalanced,
  )[0];
  const fastest = [...eligible].sort(
    (a, b) => a.scoreFastest - b.scoreFastest,
  )[0];
  const labelMap = new Map<string, CityRecommendation>();

  for (const [label, item] of [
    ["cheapest", cheapest],
    ["balanced", balanced],
    ["fastest", fastest],
  ] as const) {
    if (!item) continue;
    const existing = labelMap.get(item.cityCode) ?? { ...item, labels: [] };
    existing.labels = Array.from(new Set([...existing.labels, label]));
    labelMap.set(item.cityCode, existing);
  }

  return Array.from(labelMap.values());
}
