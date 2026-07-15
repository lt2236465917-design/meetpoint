import { createUnavailableTravelOption } from "@/lib/travel/unavailable-option";
import type { TravelProvider, TravelSearchInput } from "@/lib/travel/types";
import type { TransportMode, TravelOption } from "@/types/domain";
import type { QueryOutcome, VerifiedQuote } from "@/lib/agent/contracts";
import { validateArrivalDate } from "@/lib/recommendation/date";
import type { RouteTaskDraft } from "@/lib/recommendation/query-matrix";
import { GatewayClientError, searchGateway } from "@/lib/travel/gateway-client";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_TIMEOUT_PER_GROUP_MS = 25_000;
const DEFAULT_SECONDARY_TIMEOUT_MS = 15_000;
const PROVIDER_SEARCH_CONCURRENCY = 1;
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

const RETRYABLE_CODES = new Set([
  "GATEWAY_TIMEOUT",
  "GATEWAY_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UPSTREAM_UNAVAILABLE",
]);

export async function executeRouteTask(task: RouteTaskDraft): Promise<QueryOutcome> {
  try {
    const response = await searchGateway({
      originCityCode: task.originCityCode,
      originCityName: task.originCityName ?? task.originCityCode,
      destinationCityCode: task.cityCode,
      destinationCityName: task.cityName ?? task.cityCode,
      departureDate: task.searchDate,
      mode: task.mode,
    });

    const quotes = response.options
      .filter((option) => option.mode === task.mode)
      .map((option): VerifiedQuote => ({
        id: option.quoteId,
        quoteId: option.quoteId,
        providerQuoteId: option.providerQuoteId,
        participantId: task.participantId,
        cityCode: task.cityCode,
        mode: option.mode,
        searchDate: task.searchDate,
        queriedAt: response.queriedAt,
        priceCny: option.priceCny,
        departAt: option.departAt,
        arriveAt: option.arriveAt,
        durationMinutes: option.durationMinutes,
        transferCount: option.transferCount,
        isDirect: option.isDirect,
        serviceName: option.serviceName,
      }))
      .filter((quote) => validateArrivalDate(quote, task.arrivalDate).ok)
      .sort((left, right) => left.quoteId.localeCompare(right.quoteId));

    return quotes.length > 0 ? { status: "success", quotes } : { status: "empty" };
  } catch (error) {
    const code = error instanceof GatewayClientError ? error.code : "INTERNAL_ERROR";
    if (code === "PROVIDER_NO_ROUTE" || code === "PROVIDER_NO_TICKET") {
      return { status: "empty" };
    }
    if (RETRYABLE_CODES.has(code)) {
      return {
        status: "retryable_failure",
        code,
        retryAfterMs: error instanceof GatewayClientError && error.retryAfterMs !== null
          ? error.retryAfterMs
          : 0,
      };
    }
    return { status: "terminal_failure", code };
  }
}

type SearchParticipant = {
  id: string;
  departureCityCode: string;
  departureCityName: string;
  acceptedModes: readonly TransportMode[];
};

type SearchCandidate = {
  code: string;
  name: string;
};

type SearchGroup = {
  key: string;
  input: TravelSearchInput;
  mode: TransportMode;
  participantIds: string[];
};

type SearchOutcome =
  | { status: "fulfilled"; options: TravelOption[] }
  | { status: "rejected" };

export type CollectTravelOptionsInput = {
  participants: readonly SearchParticipant[];
  candidates: readonly SearchCandidate[];
  meetingDate: string;
  provider: TravelProvider;
  timeoutMs?: number;
};

export type CollectTravelOptionsResult = {
  options: TravelOption[];
  usedFallback: boolean;
};

export function travelSearchKey(input: {
  originCityCode: string;
  destinationCityCode: string;
  meetingDate: string;
  mode: TransportMode;
}) {
  return [
    input.originCityCode,
    input.destinationCityCode,
    input.meetingDate,
    input.mode,
    "v1",
  ].join(":");
}

export function resolveTravelCollectionTimeoutMs({
  explicitTimeoutMs,
  groupCount,
}: {
  explicitTimeoutMs?: number;
  groupCount: number;
}) {
  const parsed = explicitTimeoutMs ?? Number(process.env.TRAVEL_CALCULATION_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return Math.max(DEFAULT_TIMEOUT_MS, Math.max(0, groupCount) * DEFAULT_TIMEOUT_PER_GROUP_MS);
}

function secondaryTimeoutMs(primaryTimeoutMs: number) {
  if (primaryTimeoutMs < 1_000) return 0;
  const parsed = Number(process.env.TRAVEL_SECONDARY_QUERY_TIMEOUT_MS);
  const configured = Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_SECONDARY_TIMEOUT_MS;
  return Math.min(configured, primaryTimeoutMs);
}

function uniqueModes(modes: readonly TransportMode[]): TransportMode[] {
  return [...new Set(modes)].sort();
}

function createGroups(input: CollectTravelOptionsInput): SearchGroup[] {
  const groups = new Map<string, SearchGroup>();

  for (const candidate of input.candidates) {
    for (const participant of input.participants) {
      for (const mode of uniqueModes(participant.acceptedModes)) {
        const key = travelSearchKey({
          originCityCode: participant.departureCityCode,
          destinationCityCode: candidate.code,
          meetingDate: input.meetingDate,
          mode,
        });
        const existing = groups.get(key);
        if (existing) {
          existing.participantIds.push(participant.id);
          continue;
        }

        groups.set(key, {
          key,
          mode,
          participantIds: [participant.id],
          input: {
            participantId: participant.id,
            originCityCode: participant.departureCityCode,
            originCityName: participant.departureCityName,
            destinationCityCode: candidate.code,
            destinationCityName: candidate.name,
            meetingDate: input.meetingDate,
            acceptedModes: [mode],
          },
        });
      }
    }
  }

  return Array.from(groups.values()).sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

function parseDate(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function shanghaiDateTime(value: string | null) {
  if (!value) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(byType.get("year"));
  const month = Number(byType.get("month"));
  const day = Number(byType.get("day"));
  const hour = Number(byType.get("hour"));
  const minute = Number(byType.get("minute"));
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;

  return { date: [year, month, day] as [number, number, number], minutes: hour * 60 + minute };
}

function sameDate(
  left: [number, number, number],
  right: [number, number, number],
) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function isFeasibleArrivalDateRoute(
  option: TravelOption,
  meetingDate: string,
) {
  if (option.source !== "real") return true;
  const targetDate = parseDate(meetingDate);
  const arrival = shanghaiDateTime(option.arriveAt);
  return Boolean(
    targetDate &&
      arrival &&
      sameDate(arrival.date, targetDate),
  );
}

function optionFactKey(option: TravelOption) {
  return JSON.stringify([
    option.mode,
    option.source,
    option.provider,
    option.priceCny,
    option.departAt,
    option.arriveAt,
    option.durationMinutes,
    option.isDirect,
    option.hasTransfer,
    option.transferCount,
    option.serviceName,
    option.bookingUrl,
    option.queriedAt,
    option.failureReason,
  ]);
}

function compareOptions(left: TravelOption, right: TravelOption) {
  const leftKey = [left.participantId, left.candidateCityCode, optionFactKey(left)].join(":");
  const rightKey = [right.participantId, right.candidateCityCode, optionFactKey(right)].join(":");
  return leftKey.localeCompare(rightKey);
}

function cloneForParticipants(group: SearchGroup, options: TravelOption[]) {
  const feasibleFacts = options
    .filter((option) => option.mode === group.mode)
    .filter((option) =>
      isFeasibleArrivalDateRoute(option, group.input.meetingDate),
    )
    .sort((left, right) => optionFactKey(left).localeCompare(optionFactKey(right)));
  const facts = feasibleFacts.length
    ? feasibleFacts
    : [
        createUnavailableTravelOption(
          group.input,
          group.mode,
          "NO_FEASIBLE_SAME_DAY_ROUTE",
        ),
      ];

  return group.participantIds.flatMap((participantId) =>
    facts.map((fact) => ({
      ...fact,
      participantId,
      candidateCityCode: group.input.destinationCityCode,
      mode: group.mode,
    })),
  );
}

export async function collectTravelOptions(
  input: CollectTravelOptionsInput,
): Promise<CollectTravelOptionsResult> {
  const groups = createGroups(input);
  const outcomes = new Map<string, SearchOutcome>();
  const deadline = resolveTravelCollectionTimeoutMs({
    explicitTimeoutMs: input.timeoutMs,
    groupCount: groups.length,
  });
  const searchGroup = async (group: SearchGroup, deadlineAt: number) => {
    try {
      const options = await input.provider.search(group.input);
      if (Date.now() > deadlineAt) return;
      outcomes.set(group.key, {
        status: "fulfilled",
        options,
      });
    } catch {
      if (Date.now() > deadlineAt) return;
      outcomes.set(group.key, { status: "rejected" });
    }
  };

  const runGroups = async (groupsToRun: SearchGroup[], timeoutMs: number) => {
    if (groupsToRun.length === 0 || timeoutMs <= 0) return;
    const deadlineAt = Date.now() + timeoutMs;
    let nextGroupIndex = 0;
    const workers = Array.from(
      { length: Math.min(PROVIDER_SEARCH_CONCURRENCY, groupsToRun.length) },
      async () => {
        while (Date.now() <= deadlineAt) {
          const group = groupsToRun[nextGroupIndex];
          nextGroupIndex += 1;
          if (!group) return;
          await searchGroup(group, deadlineAt);
        }
      },
    );

    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(workers),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(0, deadlineAt - Date.now()));
      }),
    ]);
    if (timer) clearTimeout(timer);
  };

  await runGroups(groups, deadline);

  const groupsNeedingSecondaryLookup = groups.filter((group) => {
    const outcome = outcomes.get(group.key);
    return outcome === undefined || outcome.status === "rejected";
  });
  await runGroups(groupsNeedingSecondaryLookup, secondaryTimeoutMs(deadline));

  const options = groups.flatMap((group) => {
    const outcome = outcomes.get(group.key);
    if (outcome?.status === "fulfilled") {
      return cloneForParticipants(group, outcome.options);
    }
    return group.participantIds.map((participantId) =>
      createUnavailableTravelOption(
        { ...group.input, participantId },
        group.mode,
        "NO_FEASIBLE_SAME_DAY_ROUTE",
      ),
    );
  });

  return {
    options: options.sort(compareOptions),
    usedFallback: options.some((option) => option.source === "estimated"),
  };
}
