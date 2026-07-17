import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SharedRecommendation } from "@/components/result/SharedRecommendation";

const result = {
  id: "result-1",
  cityCode: "nanjing",
  cityName: "南京",
  explanationZh: "全员均有可核验的直达路线。",
  publishedAt: "2026-07-15T08:00:00.000Z",
  schemes: [
    {
      id: "scheme-saving",
      kind: "saving" as const,
      totalFareCny: 820,
      totalDurationMinutes: 420,
      teamTransferCount: 0,
      latestArrivalAt: "2026-08-15T12:00:00+08:00",
      routes: [
        {
          participantId: "participant-1",
          participantName: "李雷",
          departureCityName: "北京",
          quoteId: "quote-saving-beijing-001",
          mode: "high_speed_rail" as const,
          provider: "flyai" as const,
          queriedAt: "2026-07-15T07:30:00.000Z",
          priceCny: 500,
          departAt: "2026-08-15T08:00:00+08:00",
          arriveAt: "2026-08-15T12:00:00+08:00",
          durationMinutes: 240,
          transferCount: 0,
          serviceName: "G101",
          departureStationName: "北京南",
          arrivalStationName: "南京南",
        },
        {
          participantId: "participant-2",
          participantName: "韩梅梅",
          departureCityName: "上海",
          quoteId: "quote-saving-shanghai-002",
          mode: "high_speed_rail" as const,
          provider: "flyai" as const,
          queriedAt: "2026-07-15T07:31:00.000Z",
          priceCny: 320,
          departAt: "2026-08-15T09:00:00+08:00",
          arriveAt: "2026-08-15T12:00:00+08:00",
          durationMinutes: 180,
          transferCount: 0,
          serviceName: "G5",
          departureStationName: "上海虹桥",
          arrivalStationName: "南京南",
        },
      ],
    },
    {
      id: "scheme-fast",
      kind: "fast" as const,
      totalFareCny: 1_280,
      totalDurationMinutes: 250,
      teamTransferCount: 1,
      latestArrivalAt: "2026-08-15T11:30:00+08:00",
      routes: [
        {
          participantId: "participant-1",
          participantName: "李雷",
          departureCityName: "北京",
          quoteId: "quote-fast-beijing-003",
          mode: "flight" as const,
          provider: "flyai" as const,
          queriedAt: "2026-07-15T07:32:00.000Z",
          priceCny: 960,
          departAt: "2026-08-15T00:40:00.000Z",
          arriveAt: "2026-08-15T02:40:00.000Z",
          durationMinutes: 120,
          transferCount: 1,
          serviceName: "MU5102",
          departureStationName: "北京首都",
          arrivalStationName: "南京禄口",
        },
        {
          participantId: "participant-2",
          participantName: "韩梅梅",
          departureCityName: "上海",
          quoteId: "quote-fast-shanghai-004",
          mode: "high_speed_rail" as const,
          provider: "flyai" as const,
          queriedAt: "2026-07-15T07:33:00.000Z",
          priceCny: 320,
          departAt: "2026-08-15T09:20:00+08:00",
          arriveAt: "2026-08-15T11:30:00+08:00",
          durationMinutes: 130,
          transferCount: 0,
          serviceName: "G7",
          departureStationName: "上海虹桥",
          arrivalStationName: "南京南",
        },
      ],
    },
  ],
};

describe("SharedRecommendation", () => {
  it("renders one city and exactly the persisted saving and fast schemes", () => {
    const html = renderToStaticMarkup(
      createElement(SharedRecommendation, { result }),
    );

    expect(html.match(/<h2[^>]*>南京<\/h2>/g)).toHaveLength(1);
    expect(html.match(/省钱方案/g)).toHaveLength(1);
    expect(html.match(/省时方案/g)).toHaveLength(1);
    expect(html).toContain("团队总路费 ¥820");
    expect(html).toContain("团队总耗时 7小时");
    expect(html).toContain("全员中转 0 次");
    expect(html).toContain("团队总路费 ¥1280");
    expect(html).toContain("全员中转 1 次");
    expect(html).toContain("全员均有可核验的直达路线");
  });

  it("renders every selected participant route and evidence freshness", () => {
    const html = renderToStaticMarkup(
      createElement(SharedRecommendation, { result }),
    );

    expect(html.match(/李雷/g)).toHaveLength(2);
    expect(html.match(/韩梅梅/g)).toHaveLength(2);
    expect(html).toContain("北京南 → 南京南");
    expect(html).toContain("上海虹桥 → 南京南");
    expect(html).toContain("飞机 · MU5102");
    expect(html).toContain("08:40–10:40");
    expect(html).toContain("2小时");
    expect(html).toContain("中转 1 次");
    expect(html).toContain("¥960");
    expect(html).toContain("飞猪");
    expect(html).toContain("报价编号 quote-fa");
    expect(html).toContain("票价查证于 2026/07/15 15:32");
  });

  it("never renders legacy ranking, estimate, average-fare, or booking UI", () => {
    const html = renderToStaticMarkup(
      createElement(SharedRecommendation, { result }),
    );

    expect(html).not.toContain("前三个城市");
    expect(html).not.toContain("综合最优");
    expect(html).not.toContain("公平差");
    expect(html).not.toContain("估算");
    expect(html).not.toContain("人均");
    expect(html).not.toContain("平均票价");
    expect(html).not.toContain("去飞猪查看");
    expect(html).not.toContain("booking_url");
  });
});
