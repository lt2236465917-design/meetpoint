import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  hasPrimaryRecommendations,
  ResultContent,
} from "@/app/p/[code]/result/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("result page recommendation eligibility", () => {
  it("treats a completed run with no primary labels as no feasible city", () => {
    expect(
      hasPrimaryRecommendations([
        {
          id: "rec-1",
          city_code: "nanjing",
          city_name: "南京",
          total_price_cny: 0,
          labels: [],
          explanation: null,
          risk_summary: null,
          estimate_penalty: 0,
          transfer_penalty: 0,
          waiting_penalty: 0,
          total_duration_minutes: 0,
          fairness_gap: 0,
        },
      ]),
    ).toBe(false);
  });

  it("detects at least one primary recommendation label", () => {
    expect(
      hasPrimaryRecommendations([
        {
          id: "rec-1",
          city_code: "nanjing",
          city_name: "南京",
          total_price_cny: 1000,
          labels: ["balanced"],
          explanation: null,
          risk_summary: null,
          estimate_penalty: 0,
          transfer_penalty: 0,
          waiting_penalty: 0,
          total_duration_minutes: 300,
          fairness_gap: 100,
        },
      ]),
    ).toBe(true);
  });

  it("renders the no-feasible-city notice instead of unlabeled cards", () => {
    const html = renderToStaticMarkup(
      createElement(ResultContent, {
        code: "ABC123",
        title: "杭州周末见面",
        runStatus: "completed",
        isStale: false,
        recommendations: [
          {
            id: "rec-1",
            city_code: "nanjing",
            city_name: "南京",
            total_price_cny: 0,
            labels: [],
            explanation: null,
            risk_summary: null,
            estimate_penalty: 0,
            transfer_penalty: 0,
            waiting_penalty: 0,
            total_duration_minutes: 0,
            fairness_gap: 0,
          },
        ],
      }),
    );

    expect(html).toContain("按当前到达时间，没有找到全员可行城市");
    expect(html).toContain("请调整目标到达时间或会议日期后重新计算");
    expect(html).not.toContain("南京");
  });

  it("does not present an in-progress run as a completed result", () => {
    const html = renderToStaticMarkup(
      createElement(ResultContent, {
        code: "ABC123",
        title: "杭州周末见面",
        runStatus: "running",
        isStale: false,
        recommendations: [],
      }),
    );

    expect(html).toContain("正在查询票价并生成结果，请稍后自动刷新。");
    expect(html).toContain("正在生成结果");
    expect(html).toContain("刷新结果");
    expect(html).not.toContain("没有找到全员可行城市");
  });
});
