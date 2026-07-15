import {
  calculationOutputSchema,
  type ValidationDecision,
  type VerifiedQuote,
} from "@/lib/agent/contracts";
import { arrivalDateInShanghai } from "@/lib/recommendation/date";
import {
  PolicyLimitExceededError,
  rankEligibleCities,
  type PolicyQuote,
} from "@/lib/recommendation/policy";

type QuoteMap = ReadonlyMap<string, Pick<VerifiedQuote, "priceCny">>;

export function sumFares(quoteIds: readonly string[], quoteMap: QuoteMap): number {
  return quoteIds.reduce((sum, quoteId) => {
    const quote = quoteMap.get(quoteId);
    if (!quote) throw new Error(`Unknown quote ID: ${quoteId}`);
    return sum + quote.priceCny;
  }, 0);
}

export type ValidateRecommendationPolicyInput = {
  participantIds: readonly string[];
  arrivalDate: string;
  cityInputs: readonly {
    cityCode: string;
    quotes: readonly PolicyQuote[];
  }[];
  proposal: unknown;
};

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function schemeKindsAreExact(proposal: unknown): boolean {
  if (typeof proposal !== "object" || proposal === null) return false;
  const schemes = (proposal as { schemes?: unknown }).schemes;
  return Array.isArray(schemes)
    && schemes.length === 2
    && (schemes[0] as { kind?: unknown } | undefined)?.kind === "saving"
    && (schemes[1] as { kind?: unknown } | undefined)?.kind === "fast";
}

function uniqueCodes(codes: readonly string[]): string[] {
  return [...new Set(codes)];
}

export function validateRecommendationPolicy(
  input: ValidateRecommendationPolicyInput,
): ValidationDecision {
  const codes = new Set<string>();

  if (!schemeKindsAreExact(input.proposal)) codes.add("INVALID_SCHEMES");
  const parsed = calculationOutputSchema.safeParse(input.proposal);
  if (!parsed.success || parsed.data.status !== "proposal") {
    if (!codes.has("INVALID_SCHEMES")) codes.add("INVALID_PROPOSAL");
    return { ok: false, codes: [...codes] };
  }
  const proposal = parsed.data;
  const proposedInput = input.cityInputs.find(
    (city) => city.cityCode === proposal.cityCode,
  );
  const proposedQuotes = proposedInput?.quotes ?? [];
  if (proposedQuotes.some((quote) =>
    quote.source !== undefined && quote.source !== "real"
  )) codes.add("ESTIMATED_QUOTE");
  if (proposedQuotes.some((quote) =>
    arrivalDateInShanghai(quote.arriveAt) !== input.arrivalDate
  )) codes.add("ARRIVAL_DATE_MISMATCH");
  for (const participantId of input.participantIds) {
    if (!proposedQuotes.some((quote) =>
      quote.participantId === participantId
      && quote.cityCode === proposal.cityCode
      && (quote.source === undefined || quote.source === "real")
      && arrivalDateInShanghai(quote.arriveAt) === input.arrivalDate
    )) codes.add("MISSING_PARTICIPANT");
  }

  let ranked;
  try {
    ranked = rankEligibleCities(input.cityInputs.map((city) => ({
      ...city,
      participantIds: input.participantIds,
      arrivalDate: input.arrivalDate,
    })));
  } catch (error) {
    if (error instanceof PolicyLimitExceededError) {
      return { ok: false, codes: [error.code] };
    }
    throw error;
  }
  const orderedCityCodes = ranked.map((city) => city.cityCode);
  const eligibleCityCodes = [...orderedCityCodes].sort();
  if (
    !sameStrings(
      uniqueCodes(proposal.comparisonEvidence.eligibleCityCodes),
      proposal.comparisonEvidence.eligibleCityCodes,
    )
    || !sameStrings(
      uniqueCodes(proposal.comparisonEvidence.orderedCityCodes),
      proposal.comparisonEvidence.orderedCityCodes,
    )
    || !sameStrings(proposal.comparisonEvidence.eligibleCityCodes, eligibleCityCodes)
    || !sameStrings(proposal.comparisonEvidence.orderedCityCodes, orderedCityCodes)
    || proposal.cityCode !== orderedCityCodes[0]
  ) codes.add("INVALID_CITY_EVIDENCE");

  const selectedCity = ranked.find((city) => city.cityCode === proposal.cityCode);
  const selectedInput = input.cityInputs.find((city) => city.cityCode === proposal.cityCode);
  if (!selectedCity || !selectedInput) {
    codes.add("POLICY_MISMATCH");
    return { ok: false, codes: [...codes] };
  }

  for (const [index, actualScheme] of proposal.schemes.entries()) {
    const expectedScheme = index === 0
      ? selectedCity.savingScheme
      : selectedCity.fastScheme;
    const actualParticipantIds = Object.keys(actualScheme.quoteIdsByParticipant);
    if (!sameStrings([...actualParticipantIds].sort(), [...input.participantIds].sort())) {
      codes.add("MISSING_PARTICIPANT");
    }

    const selectedQuotes: VerifiedQuote[] = [];
    for (const participantId of input.participantIds) {
      const quoteId = actualScheme.quoteIdsByParticipant[participantId];
      const selectedQuote = selectedInput.quotes.find((quote) =>
        quote.participantId === participantId && quote.quoteId === quoteId
      );
      if (!quoteId || !selectedQuote) {
        codes.add("UNKNOWN_QUOTE_ID");
        continue;
      }
      selectedQuotes.push(selectedQuote);
    }

    if (selectedQuotes.length === input.participantIds.length) {
      const quoteMap = new Map(selectedQuotes.map((quote) => [quote.quoteId, quote]));
      const selectedIds = selectedQuotes.map((quote) => quote.quoteId);
      if (sumFares(selectedIds, quoteMap) !== actualScheme.totalFareCny) {
        codes.add("TOTAL_FARE_MISMATCH");
      }
    }

    if (
      actualScheme.totalFareCny !== expectedScheme.totalFareCny
      || input.participantIds.some((participantId) =>
        actualScheme.quoteIdsByParticipant[participantId]
          !== expectedScheme.quoteIdsByParticipant[participantId]
      )
    ) codes.add("POLICY_MISMATCH");
  }

  return codes.size === 0 ? { ok: true } : { ok: false, codes: [...codes] };
}
