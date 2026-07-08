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
    expect(html).toContain("flight / high_speed_rail");
  });

  it("renders recommendation prices and risk badges", () => {
    const html = renderToStaticMarkup(
      createElement(RecommendationCard, {
        recommendation: {
          id: "rec-1",
          city_name: "南京",
          total_price_cny: 1200,
          avg_price_cny: 400,
          labels: ["均衡", "省时"],
          explanation: "三人整体路程接近，价格差距较小。",
          risk_summary: "含估算票价",
          estimate_penalty: 8,
          transfer_penalty: 0,
          waiting_penalty: 12,
        },
      }),
    );

    expect(html).toContain("南京");
    expect(html).toContain("¥1200");
    expect(html).toContain("人均 ¥400");
    expect(html).toContain("含估算");
    expect(html).toContain("等待较久");
    expect(html).toContain("三人整体路程接近，价格差距较小。");
  });
});
