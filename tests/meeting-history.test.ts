import { describe, expect, it } from "vitest";
import {
  createMeetingHistoryItem,
  getMeetingHistorySnapshot,
  parseMeetingHistory,
  serializeMeetingHistory,
  upsertMeetingHistoryItem,
  meetingHistoryUpdatedEvent,
} from "@/lib/ui/meeting-history";

describe("meeting history", () => {
  it("keeps the latest local meeting record first and deduplicates by plan code", () => {
    const first = createMeetingHistoryItem({
      code: "AAA111",
      title: "上海周末见面",
      arrivalDate: "2026-08-15",
      hostToken: "host-token",
      role: "host",
      lastVisitedAt: "2026-07-10T08:00:00.000Z",
    });
    const second = createMeetingHistoryItem({
      code: "BBB222",
      title: "杭州碰头",
      arrivalDate: "2026-08-16",
      role: "participant",
      lastVisitedAt: "2026-07-10T09:00:00.000Z",
    });
    const updatedFirst = createMeetingHistoryItem({
      code: "AAA111",
      title: "上海周末见面",
      arrivalDate: "2026-08-15",
      role: "participant",
      lastVisitedAt: "2026-07-10T10:00:00.000Z",
    });

    const history = upsertMeetingHistoryItem(
      upsertMeetingHistoryItem(
        upsertMeetingHistoryItem([], first),
        second,
      ),
      updatedFirst,
    );

    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      code: "AAA111",
      role: "host",
      hostToken: "host-token",
      lastVisitedAt: "2026-07-10T10:00:00.000Z",
    });
    expect(history[1].code).toBe("BBB222");
  });

  it("parses stored local meeting records safely", () => {
    const stored = serializeMeetingHistory([
      createMeetingHistoryItem({
        code: "ABC123",
        title: "跨城见面",
        arrivalDate: "2026-08-15",
        role: "viewer",
        lastVisitedAt: "2026-07-10T08:00:00.000Z",
      }),
    ]);

    expect(parseMeetingHistory(stored)).toEqual([
      {
        code: "ABC123",
        title: "跨城见面",
        arrivalDate: "2026-08-15",
        role: "viewer",
        lastVisitedAt: "2026-07-10T08:00:00.000Z",
      },
    ]);
    expect(parseMeetingHistory("not-json")).toEqual([]);
    expect(parseMeetingHistory(null)).toEqual([]);
  });

  it("migrates old date-and-time rows without losing participant credentials", () => {
    const parsed = parseMeetingHistory(JSON.stringify([{
      code: "OLD123",
      title: "旧计划",
      meetingDate: "2026-08-20",
      targetArrivalTime: "18:30",
      role: "participant",
      participantEditToken: "edit-token",
      lastVisitedAt: "2026-07-10T08:00:00.000Z",
    }]));

    expect(parsed).toEqual([{
      code: "OLD123",
      title: "旧计划",
      arrivalDate: "2026-08-20",
      role: "participant",
      participantEditToken: "edit-token",
      lastVisitedAt: "2026-07-10T08:00:00.000Z",
    }]);
    expect(parsed[0]).not.toHaveProperty("meetingDate");
    expect(parsed[0]).not.toHaveProperty("targetArrivalTime");
  });

  it("exports an event name for same-tab local history refreshes", () => {
    expect(meetingHistoryUpdatedEvent).toBe(
      "cross-city-meetpoint:meeting-history-updated",
    );
  });

  it("keeps local participant calculation permission when the public plan page is opened later", () => {
    const hostRecord = createMeetingHistoryItem({
      code: "ABC123",
      title: "跨城见面",
      arrivalDate: "2026-08-15",
      hostToken: "host-token",
      role: "host",
      participantEditToken: "edit-token",
      lastVisitedAt: "2026-07-10T08:00:00.000Z",
    });
    const viewerRecord = createMeetingHistoryItem({
      code: "ABC123",
      title: "跨城见面",
      arrivalDate: "2026-08-15",
      role: "viewer",
      lastVisitedAt: "2026-07-10T09:00:00.000Z",
    });

    expect(upsertMeetingHistoryItem([hostRecord], viewerRecord)[0]).toMatchObject(
      {
        role: "host",
        participantEditToken: "edit-token",
        hostToken: "host-token",
        lastVisitedAt: "2026-07-10T09:00:00.000Z",
      },
    );
  });

  it("does not let viewer or participant updates overwrite a host token", () => {
    const host = createMeetingHistoryItem({
      code: "ABC123",
      title: "跨城见面",
      arrivalDate: "2026-08-15",
      role: "host",
      hostToken: "host-token",
      lastVisitedAt: "2026-07-10T08:00:00.000Z",
    });
    const viewer = createMeetingHistoryItem({
      code: "ABC123",
      title: "跨城见面",
      arrivalDate: "2026-08-15",
      role: "viewer",
      lastVisitedAt: "2026-07-10T09:00:00.000Z",
    });

    expect(upsertMeetingHistoryItem([host], viewer)[0]).toMatchObject({
      role: "host",
      hostToken: "host-token",
    });
  });

  it("returns a cached browser snapshot when local storage has not changed", () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
        },
      },
    });

    try {
      expect(getMeetingHistorySnapshot()).toBe(getMeetingHistorySnapshot());
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
