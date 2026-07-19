import type { SchemeProposal, VerifiedQuote } from "@/lib/agent/contracts";
import { arrivalDateInShanghai } from "@/lib/recommendation/date";

export type PolicyQuote = VerifiedQuote & {
  source?: "real" | "estimated" | string;
};

export type CityPolicyInput = {
  cityCode: string;
  participantIds: readonly string[];
  arrivalDate: string;
  quotes: readonly PolicyQuote[];
};

export type CityPolicyResult = {
  cityCode: string;
  savingScheme: SchemeProposal;
  fastScheme: SchemeProposal;
  directParticipantCount: number;
  fareFairnessGap: number;
  totalDurationMinutes: number;
};

export const MAX_FAST_POLICY_STATES = 50_000;
export const MAX_FAST_POLICY_TRANSITIONS = 200_000;

export class PolicyLimitExceededError extends Error {
  readonly code = "POLICY_INPUT_LIMIT_EXCEEDED";

  constructor() {
    super("Fast policy state budget exceeded");
    this.name = "PolicyLimitExceededError";
  }
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareStrings(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const compared = compareString(left[index]!, right[index]!);
    if (compared !== 0) return compared;
  }
  return compareNumber(left.length, right.length);
}

function savingOrder(left: VerifiedQuote, right: VerifiedQuote): number {
  return compareNumber(left.priceCny, right.priceCny)
    || compareNumber(left.transferCount, right.transferCount)
    || compareNumber(left.durationMinutes, right.durationMinutes)
    || compareString(left.quoteId, right.quoteId);
}

export function directFirstEligible<T extends VerifiedQuote>(quotes: readonly T[]): T[] {
  const direct = quotes.filter((quote) => quote.isDirect);
  return direct.length > 0 ? direct : [...quotes];
}

export function buildSavingScheme(
  participantIds: readonly string[],
  quotes: readonly VerifiedQuote[],
): SchemeProposal | null {
  const quoteIdsByParticipant: Record<string, string> = {};
  let totalFareCny = 0;

  for (const participantId of participantIds) {
    const eligible = directFirstEligible(
      quotes.filter((quote) => quote.participantId === participantId),
    );
    if (eligible.length === 0) return null;

    const selected = eligible.sort(savingOrder)[0];
    if (!selected) return null;

    quoteIdsByParticipant[participantId] = selected.quoteId;
    totalFareCny += selected.priceCny;
  }

  return { kind: "saving", quoteIdsByParticipant, totalFareCny };
}

type FastState = {
  totalFare: number;
  totalDuration: number;
  latestArrivalEpoch: number;
  totalTransfers: number;
  selectedQuotes: VerifiedQuote[];
  orderedQuoteIds: string[];
};

function compareFastStateAtSameFare(left: FastState, right: FastState): number {
  return compareNumber(left.totalDuration, right.totalDuration)
    || compareNumber(left.latestArrivalEpoch, right.latestArrivalEpoch)
    || compareNumber(left.totalTransfers, right.totalTransfers)
    || compareStrings(left.orderedQuoteIds, right.orderedQuoteIds);
}

function compareFinalFastState(left: FastState, right: FastState): number {
  return compareNumber(left.totalDuration, right.totalDuration)
    || compareNumber(left.latestArrivalEpoch, right.latestArrivalEpoch)
    || compareNumber(left.totalTransfers, right.totalTransfers)
    || compareNumber(left.totalFare, right.totalFare)
    || compareStrings(left.orderedQuoteIds, right.orderedQuoteIds);
}

export function buildFastScheme(
  participantIds: readonly string[],
  quotes: readonly VerifiedQuote[],
  savingTotal: number,
): SchemeProposal | null {
  let transitionCount = 0;
  let states = new Map<number, FastState>([[0, {
    totalFare: 0,
    totalDuration: 0,
    latestArrivalEpoch: Number.NEGATIVE_INFINITY,
    totalTransfers: 0,
    selectedQuotes: [],
    orderedQuoteIds: [],
  }]]);

  for (const participantId of participantIds) {
    const eligible = directFirstEligible(
      quotes.filter((quote) => quote.participantId === participantId),
    );
    if (eligible.length === 0) return null;

    const nextStates = new Map<number, FastState>();
    for (const state of states.values()) {
      for (const quote of eligible) {
        transitionCount += 1;
        if (transitionCount > MAX_FAST_POLICY_TRANSITIONS) {
          throw new PolicyLimitExceededError();
        }
        const totalFare = state.totalFare + quote.priceCny;
        if (totalFare * 10 > savingTotal * 13) continue;

        const candidate: FastState = {
          totalFare,
          totalDuration: state.totalDuration + quote.durationMinutes,
          latestArrivalEpoch: Math.max(
            state.latestArrivalEpoch,
            new Date(quote.arriveAt).getTime(),
          ),
          totalTransfers: state.totalTransfers + quote.transferCount,
          selectedQuotes: [...state.selectedQuotes, quote],
          orderedQuoteIds: [...state.orderedQuoteIds, quote.quoteId],
        };
        const existing = nextStates.get(totalFare);
        if (!existing && nextStates.size >= MAX_FAST_POLICY_STATES) {
          throw new PolicyLimitExceededError();
        }
        if (!existing || compareFastStateAtSameFare(candidate, existing) < 0) {
          nextStates.set(totalFare, candidate);
        }
      }
    }
    if (nextStates.size === 0) return null;
    states = nextStates;
  }

  const selected = [...states.values()].sort(compareFinalFastState)[0];
  if (!selected) return null;

  return {
    kind: "fast",
    quoteIdsByParticipant: Object.fromEntries(
      participantIds.map((participantId, index) => [
        participantId,
        selected.selectedQuotes[index]!.quoteId,
      ]),
    ),
    totalFareCny: selected.totalFare,
  };
}

function selectedQuote(
  scheme: SchemeProposal,
  participantId: string,
  quotes: readonly VerifiedQuote[],
): VerifiedQuote | null {
  const quoteId = scheme.quoteIdsByParticipant[participantId];
  return quotes.find((quote) =>
    quote.participantId === participantId && quote.quoteId === quoteId
  ) ?? null;
}

function buildCityResult(input: CityPolicyInput): CityPolicyResult | null {
  const participantIds = [...new Set(input.participantIds)];
  if (
    participantIds.length === 0
    || participantIds.length !== input.participantIds.length
  ) return null;
  if (input.quotes.some((quote) =>
    quote.cityCode !== input.cityCode
    || (quote.source !== undefined && quote.source !== "real")
    || arrivalDateInShanghai(quote.arriveAt) !== input.arrivalDate
  )) return null;

  const savingScheme = buildSavingScheme(participantIds, input.quotes);
  if (!savingScheme) return null;
  const fastScheme = buildFastScheme(
    participantIds,
    input.quotes,
    savingScheme.totalFareCny,
  );
  if (!fastScheme) return null;

  const savingQuotes = participantIds.map((participantId) =>
    selectedQuote(savingScheme, participantId, input.quotes)
  );
  if (savingQuotes.some((quote) => quote === null)) return null;
  const selected = savingQuotes as VerifiedQuote[];
  const fares = selected.map((quote) => quote.priceCny);

  return {
    cityCode: input.cityCode,
    savingScheme,
    fastScheme,
    directParticipantCount: selected.filter((quote) => quote.isDirect).length,
    fareFairnessGap: Math.max(...fares) - Math.min(...fares),
    totalDurationMinutes: selected.reduce(
      (sum, quote) => sum + quote.durationMinutes,
      0,
    ),
  };
}

export function rankEligibleCities(
  cityInputs: readonly CityPolicyInput[],
): CityPolicyResult[] {
  return cityInputs
    .map(buildCityResult)
    .filter((result): result is CityPolicyResult => result !== null)
    .sort((left, right) =>
      compareNumber(left.savingScheme.totalFareCny, right.savingScheme.totalFareCny)
      || compareNumber(right.directParticipantCount, left.directParticipantCount)
      || compareNumber(left.fareFairnessGap, right.fareFairnessGap)
      || compareNumber(left.totalDurationMinutes, right.totalDurationMinutes)
      || compareString(left.cityCode, right.cityCode)
    );
}
