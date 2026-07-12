import { estimateTravelOption } from "@/lib/travel/estimate-provider";
import { createUnavailableTravelOption } from "@/lib/travel/unavailable-option";
import type { TravelProvider, TravelSearchInput } from "@/lib/travel/types";
import type { TransportMode, TravelOption } from "@/types/domain";

const DEFAULT_TIMEOUT_MS = 45_000;
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

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
  targetArrivalTime: string;
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

function calculationTimeoutMs(value?: number) {
  const parsed = value ?? Number(process.env.TRAVEL_CALCULATION_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
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
            targetArrivalTime: input.targetArrivalTime,
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

function minutesFromTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function sameDate(
  left: [number, number, number],
  right: [number, number, number],
) {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function isFeasibleSameDayRoute(
  option: TravelOption,
  meetingDate: string,
  targetArrivalTime: string,
) {
  if (option.source !== "real") return true;
  const targetDate = parseDate(meetingDate);
  const targetMinutes = minutesFromTime(targetArrivalTime);
  const departure = shanghaiDateTime(option.departAt);
  const arrival = shanghaiDateTime(option.arriveAt);
  return Boolean(
    targetDate &&
      targetMinutes !== null &&
      departure &&
      arrival &&
      sameDate(departure.date, targetDate) &&
      sameDate(arrival.date, targetDate) &&
      arrival.minutes <= targetMinutes,
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
      isFeasibleSameDayRoute(
        option,
        group.input.meetingDate,
        group.input.targetArrivalTime,
      ),
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
  const startedAt = Date.now();
  const groups = createGroups(input);
  const outcomes = new Map<string, SearchOutcome>();
  const deadline = calculationTimeoutMs(input.timeoutMs);
  const deadlineAt = startedAt + deadline;
  const pending = groups.map(async (group) => {
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
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(pending),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, Math.max(0, deadlineAt - Date.now()));
    }),
  ]);
  if (timer) clearTimeout(timer);

  const options = groups.flatMap((group) => {
    const outcome = outcomes.get(group.key);
    if (outcome?.status === "fulfilled") {
      return cloneForParticipants(group, outcome.options);
    }
    return group.participantIds.map((participantId) =>
      estimateTravelOption({ ...group.input, participantId }, group.mode),
    );
  });

  return {
    options: options.sort(compareOptions),
    usedFallback: options.some((option) => option.source === "estimated"),
  };
}
