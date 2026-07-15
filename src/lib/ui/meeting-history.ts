export const meetingHistoryStorageKey = "cross-city-meetpoint:meeting-history";
export const meetingHistoryUpdatedEvent =
  "cross-city-meetpoint:meeting-history-updated";
export const meetingHistoryLimit = 8;

export type MeetingHistoryRole = "host" | "participant" | "viewer";

export type MeetingHistoryItem = {
  code: string;
  title: string;
  arrivalDate: string;
  role: MeetingHistoryRole;
  hostToken?: string;
  participantEditToken?: string;
  latestRun?: boolean;
  lastVisitedAt: string;
};

const emptyMeetingHistorySnapshot: MeetingHistoryItem[] = [];
let cachedMeetingHistoryRaw: string | null | undefined;
let cachedMeetingHistorySnapshot: MeetingHistoryItem[] =
  emptyMeetingHistorySnapshot;

export function createMeetingHistoryItem(
  item: MeetingHistoryItem,
): MeetingHistoryItem {
  return {
    code: item.code,
    title: item.title,
    arrivalDate: item.arrivalDate,
    role: item.role,
    hostToken: item.role === "host" ? item.hostToken : undefined,
    participantEditToken: item.participantEditToken,
    latestRun: item.latestRun,
    lastVisitedAt: item.lastVisitedAt,
  };
}

export function upsertMeetingHistoryItem(
  history: MeetingHistoryItem[],
  item: MeetingHistoryItem,
): MeetingHistoryItem[] {
  const existing = history.find((record) => record.code === item.code);
  const nextItem = existing ? mergeMeetingHistoryItem(existing, item) : item;

  return [nextItem, ...history.filter((record) => record.code !== item.code)]
    .sort(
      (left, right) =>
        new Date(right.lastVisitedAt).getTime() -
        new Date(left.lastVisitedAt).getTime(),
    )
    .slice(0, meetingHistoryLimit);
}

export function serializeMeetingHistory(history: MeetingHistoryItem[]): string {
  return JSON.stringify(history);
}

export function parseMeetingHistory(
  value: string | null,
): MeetingHistoryItem[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(parseMeetingHistoryItem)
      .filter((item): item is MeetingHistoryItem => item !== null)
      .slice(0, meetingHistoryLimit);
  } catch {
    return [];
  }
}

export function readMeetingHistory(): MeetingHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    return parseMeetingHistory(
      window.localStorage.getItem(meetingHistoryStorageKey),
    );
  } catch {
    return [];
  }
}

export function getMeetingHistorySnapshot(): MeetingHistoryItem[] {
  if (typeof window === "undefined") return emptyMeetingHistorySnapshot;

  try {
    const raw = window.localStorage.getItem(meetingHistoryStorageKey);
    if (raw === cachedMeetingHistoryRaw) return cachedMeetingHistorySnapshot;

    cachedMeetingHistoryRaw = raw;
    cachedMeetingHistorySnapshot = parseMeetingHistory(raw);
    return cachedMeetingHistorySnapshot;
  } catch {
    cachedMeetingHistoryRaw = undefined;
    cachedMeetingHistorySnapshot = emptyMeetingHistorySnapshot;
    return cachedMeetingHistorySnapshot;
  }
}

export function saveMeetingHistory(history: MeetingHistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      meetingHistoryStorageKey,
      serializeMeetingHistory(history),
    );
    window.dispatchEvent(new Event(meetingHistoryUpdatedEvent));
  } catch {
    // Local history is a convenience layer; storage failures must not block flow.
  }
}

export function rememberMeetingHistoryItem(item: MeetingHistoryItem) {
  saveMeetingHistory(upsertMeetingHistoryItem(readMeetingHistory(), item));
}

function parseMeetingHistoryItem(value: unknown): MeetingHistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const arrivalDate =
    typeof record.arrivalDate === "string"
      ? record.arrivalDate
      : typeof record.meetingDate === "string"
        ? record.meetingDate
        : null;

  if (!(
    typeof record.code === "string" &&
    typeof record.title === "string" &&
    arrivalDate !== null &&
    isMeetingHistoryRole(record.role) &&
    (record.hostToken === undefined || typeof record.hostToken === "string") &&
    (record.participantEditToken === undefined ||
      typeof record.participantEditToken === "string") &&
    (record.latestRun === undefined || typeof record.latestRun === "boolean") &&
    typeof record.lastVisitedAt === "string"
  )) return null;

  return createMeetingHistoryItem({
    code: record.code,
    title: record.title,
    arrivalDate,
    role: record.role,
    hostToken: record.hostToken,
    participantEditToken: record.participantEditToken,
    latestRun: record.latestRun,
    lastVisitedAt: record.lastVisitedAt,
  });
}

function isMeetingHistoryRole(value: unknown): value is MeetingHistoryRole {
  return value === "host" || value === "participant" || value === "viewer";
}

function mergeMeetingHistoryItem(
  existing: MeetingHistoryItem,
  incoming: MeetingHistoryItem,
): MeetingHistoryItem {
  return {
    ...incoming,
    role: strongerMeetingHistoryRole(existing.role, incoming.role),
    hostToken:
      existing.hostToken ??
      (incoming.role === "host" ? incoming.hostToken : undefined),
    participantEditToken:
      incoming.participantEditToken ?? existing.participantEditToken,
    latestRun: incoming.latestRun ?? existing.latestRun,
  };
}

function strongerMeetingHistoryRole(
  existing: MeetingHistoryRole,
  incoming: MeetingHistoryRole,
): MeetingHistoryRole {
  const rank: Record<MeetingHistoryRole, number> = {
    viewer: 1,
    participant: 2,
    host: 3,
  };

  return rank[existing] > rank[incoming] ? existing : incoming;
}
