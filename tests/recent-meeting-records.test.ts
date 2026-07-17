import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getEmptyMeetingRecordsSnapshot,
  RecentMeetingRecords,
  RecentMeetingRecordsView,
  subscribeToMeetingHistory,
} from "@/components/plan/RecentMeetingRecords";
import { meetingHistoryUpdatedEvent } from "@/lib/ui/meeting-history";

describe("RecentMeetingRecords", () => {
  it("renders an empty local-history state on the home page", () => {
    const html = renderToStaticMarkup(createElement(RecentMeetingRecords));

    expect(html).toContain("最近见面记录");
    expect(html).toContain("还没有见面记录");
  });

  it("links each local meeting record back to its public plan page", () => {
    const html = renderToStaticMarkup(
      createElement(RecentMeetingRecordsView, {
        records: [
          {
            code: "ABC123",
            title: "上海周末见面",
            arrivalDate: "2026-08-15",
            role: "host",
            lastVisitedAt: "2026-07-10T08:00:00.000Z",
          },
        ],
      }),
    );

    expect(html).toContain("最近见面记录");
    expect(html).toContain("上海周末见面");
    expect(html).toContain("发起的计划");
    expect(html).toContain("创建于 07-10 16:00");
    expect(html).toContain("/p/ABC123");
    expect(html).toContain("2026-08-15 到达");
  });

  it("shows an explicit view action for each local meeting record", () => {
    const html = renderToStaticMarkup(
      createElement(RecentMeetingRecordsView, {
        records: [
          {
            code: "ABC123",
            title: "上海周末见面",
            arrivalDate: "2026-08-15",
            role: "host",
            lastVisitedAt: "2026-07-10T08:00:00.000Z",
          },
        ],
      }),
    );

    expect(html).toContain("查看");
    expect(html).toContain('aria-label="查看上海周末见面填写情况"');
  });

  it("shows copy-link actions for every local meeting record", () => {
    const html = renderToStaticMarkup(
      createElement(RecentMeetingRecordsView, {
        records: [
          {
            code: "ABC123",
            title: "上海周末见面",
            arrivalDate: "2026-08-15",
            role: "host",
            latestRun: true,
            lastVisitedAt: "2026-07-10T08:00:00.000Z",
          },
        ],
      }),
    );

    expect(html).toContain("复制链接");
    expect(html).toContain('data-copy-plan-code="ABC123"');
    expect(html).toContain('aria-label="复制上海周末见面邀请链接"');
  });

  it("keeps the home page compact and moves older records behind a more-records entry", () => {
    const html = renderToStaticMarkup(
      createElement(RecentMeetingRecordsView, {
        records: Array.from({ length: 5 }, (_, index) => ({
          code: `ABC12${index}`,
          title: `见面计划 ${index + 1}`,
          arrivalDate: "2026-08-15",
          role: "participant" as const,
          lastVisitedAt: `2026-07-10T0${index}:00:00.000Z`,
        })),
      }),
    );

    expect(html).toContain("见面计划 1");
    expect(html).toContain("见面计划 2");
    expect(html).toContain("见面计划 3");
    expect(html).not.toContain("见面计划 4");
    expect(html).not.toContain("见面计划 5");
    expect(html).toContain("更多记录");
    expect(html).toContain("还有 2 条");
  });

  it("uses a cached server snapshot for local meeting records", () => {
    expect(getEmptyMeetingRecordsSnapshot()).toBe(
      getEmptyMeetingRecordsSnapshot(),
    );
  });

  it("refreshes local meeting records when returning to a cached home page", () => {
    const originalWindow = globalThis.window;
    const target = new EventTarget();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
      },
    });
    const onStoreChange = vi.fn();

    try {
      const unsubscribe = subscribeToMeetingHistory(onStoreChange);

      target.dispatchEvent(new Event("pageshow"));
      target.dispatchEvent(new Event("focus"));
      target.dispatchEvent(new Event(meetingHistoryUpdatedEvent));
      unsubscribe();
      target.dispatchEvent(new Event("pageshow"));

      expect(onStoreChange).toHaveBeenCalledTimes(3);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
