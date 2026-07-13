import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ParticipantList } from "@/components/plan/ParticipantList";
import { RecommendationCard } from "@/components/result/RecommendationCard";
import { Notice } from "@/components/ui/Notice";

describe("Task 10 UI components", () => {
  it("renders notice content in a subdued container", () => {
    const html = renderToStaticMarkup(
      createElement(Notice, null, "发起人还没有开始计算。"),
    );

    expect(html).toContain("发起人还没有开始计算。");
    expect(html).toContain("bg-gray-50");
  });

  it("renders participant city and accepted transport modes", () => {
    const html = renderToStaticMarkup(
      createElement(ParticipantList, {
        participants: [
          {
            id: "participant-1",
            name: "李雷",
            departure_city_name: "北京",
            accepted_modes: ["flight", "high_speed_rail"],
          },
        ],
      }),
    );

    expect(html).toContain("李雷");
    expect(html).toContain("北京");
    expect(html).toContain("飞机 / 高铁/动车");
  });

  it("renders recommendation prices and risk badges", () => {
    const html = renderToStaticMarkup(
      createElement(RecommendationCard, {
        recommendation: {
          id: "rec-1",
          city_name: "南京",
          total_price_cny: 1200,
          labels: ["balanced", "fastest"],
          explanation: "三人整体路程接近，价格差距较小。",
          risk_summary: "含估算票价",
          estimate_penalty: 8,
          transfer_penalty: 0,
          waiting_penalty: 12,
          total_duration_minutes: 360,
          fairness_gap: 80,
          participant_options: [
            {
              participant_name: "李雷",
              departure_city_name: "北京",
              mode: "high_speed_rail",
              price_cny: 500,
              duration_minutes: 240,
              depart_at: "2026-08-15T08:00:00+08:00",
              arrive_at: "2026-08-15T12:00:00+08:00",
              booking_url: "https://a.feizhu.com/booking/abc",
              service_name: "G101",
              source: "real",
              provider: "flyai",
              queried_at: "2026-07-12T08:30:00.000Z",
            },
            {
              participant_name: "韩梅梅",
              departure_city_name: "上海",
              mode: "flight",
              price_cny: 700,
              duration_minutes: 120,
              depart_at: "2026-08-15T09:00:00+08:00",
              arrive_at: "2026-08-15T11:00:00+08:00",
              booking_url: "https://www.fliggy.com/estimated-should-not-link",
              service_name: "MU1234",
              source: "estimated",
              provider: "estimate",
              queried_at: null,
              failure_reason: "PROVIDER_RATE_LIMITED",
            },
          ],
        },
      }),
    );

    expect(html).toContain("南京");
    expect(html).toContain("团队总路费 ¥1200");
    expect(html).not.toContain("人均");
    expect(html).toContain("综合最优 / 省时优先");
    expect(html).toContain("含估算票价");
    expect(html).toContain("部分数据为估算");
    expect(html).toContain("等待较久");
    expect(html).toContain("三人整体路程接近，价格差距较小。");
    expect(html).toContain("总耗时 6小时");
    expect(html).toContain("公平差 ¥80");
    expect(html).toContain("部分数据为估算：价格来自距离和交通方式粗估");
    expect(html).toContain("价格来自距离和交通方式粗估");
    expect(html).toContain("李雷");
    expect(html).toContain("北京出发");
    expect(html).toContain("高铁/动车");
    expect(html).toContain("G101");
    expect(html).toContain("飞猪参考价");
    expect(html).toContain("查询于 2026/07/12 16:30");
    expect(html).toContain("去飞猪查看");
    expect(html).toContain("价格和余票以跳转页面为准");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain("韩梅梅");
    expect(html).toContain("上海出发");
    expect(html).toContain("飞机");
    expect(html).toContain("MU1234");
    expect(html).toContain("估算 · 原因 PROVIDER_RATE_LIMITED");
    expect(html).not.toContain("https://www.fliggy.com/estimated-should-not-link");
  });
});
