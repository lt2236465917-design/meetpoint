import type { TransportMode } from "@/types/domain";

const SUPPORTED_MODES = new Set<TransportMode>([
  "flight",
  "high_speed_rail",
  "normal_train",
]);

type RouteParticipant = {
  id: string;
  departureCityCode: string;
  departureCityName?: string;
  acceptedModes: readonly (TransportMode | string)[];
};

type RouteCandidate = { code: string; name?: string };

export type RouteTaskDraft = {
  participantId: string;
  cityCode: string;
  originCityCode: string;
  originCityName?: string;
  cityName?: string;
  mode: TransportMode;
  searchDate: string;
  arrivalDate: string;
  physicalKey: string;
};

function parseDate(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
    ? null
    : parsed;
}

function shiftDate(date: string, days: number): string | null {
  const parsed = parseDate(date);
  if (!parsed) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function searchDates(arrivalDate: string, mode: TransportMode | string): string[] {
  if (!SUPPORTED_MODES.has(mode as TransportMode)) return [];
  const firstOffset = mode === "normal_train" ? -2 : -1;
  const dates: string[] = [];
  for (let offset = firstOffset; offset <= 0; offset += 1) {
    const date = shiftDate(arrivalDate, offset);
    if (date) dates.push(date);
  }
  return dates;
}

export function buildRouteTasks({
  participants,
  candidates,
  arrivalDate,
}: {
  participants: readonly RouteParticipant[];
  candidates: readonly RouteCandidate[];
  arrivalDate: string;
}): RouteTaskDraft[] {
  const tasks: RouteTaskDraft[] = [];

  for (const participant of participants) {
    const modes = [...new Set(participant.acceptedModes)]
      .filter((mode): mode is TransportMode => SUPPORTED_MODES.has(mode as TransportMode));
    for (const candidate of candidates) {
      for (const mode of modes) {
        for (const searchDate of searchDates(arrivalDate, mode)) {
          tasks.push({
            participantId: participant.id,
            cityCode: candidate.code,
            originCityCode: participant.departureCityCode,
            ...(participant.departureCityName
              ? { originCityName: participant.departureCityName }
              : {}),
            ...(candidate.name ? { cityName: candidate.name } : {}),
            mode,
            searchDate,
            arrivalDate,
            physicalKey: [
              participant.departureCityCode,
              candidate.code,
              mode,
              searchDate,
            ].join(":"),
          });
        }
      }
    }
  }

  return tasks.sort((left, right) => {
    const leftKey = [left.participantId, left.cityCode, left.mode, left.searchDate].join(":");
    const rightKey = [right.participantId, right.cityCode, right.mode, right.searchDate].join(":");
    return leftKey.localeCompare(rightKey);
  });
}
