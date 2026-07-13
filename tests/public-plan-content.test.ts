import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicPlanContent } from "@/components/plan/PublicPlanContent";

const planData = {
  plan: {
    title: "周末跨城见面测试",
    meeting_date: "2026-08-15",
    target_arrival_time: "18:30",
    participant_limit: 2,
  },
  participants: [
    {
      id: "participant-1",
      name: "李雷",
      departure_city_name: "北京",
      accepted_modes: ["high_speed_rail" as const],
    },
  ],
  latestRun: null,
};

describe("PublicPlanContent", () => {
  it("marks the public plan view as auto-refreshing", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: planData,
      }),
    );

    expect(html).toContain("data-auto-refresh");
    expect(html).toContain("已填写 1 人");
    expect(html).toContain("填写记录");
    expect(html).not.toContain("发起人还没有开始计算。");
  });

  it("saves viewed public plans into the local meeting records", () => {
    const componentSource = readFileSync(
      path.join(process.cwd(), "src/components/plan/PublicPlanContent.tsx"),
      "utf8",
    );

    expect(componentSource).toContain("rememberMeetingHistoryItem");
    expect(componentSource).toContain('role: "viewer"');
  });

  it("waits for the participant limit before showing calculation", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: {
          ...planData,
          localParticipantEditToken: "edit-token",
        },
      }),
    );

    expect(html).toContain("还差 1 人，填满后已填写者可发起。");
    expect(html).not.toContain("开始计算");
  });

  it("does not render the result action as a link before a run exists", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: planData,
      }),
    );

    expect(html).toContain("暂无结果");
    expect(html).not.toContain('href="/p/ABC123/result"');
  });

  it("renders the result action as a link after a run exists", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: {
          ...planData,
          latestRun: { id: "run-1" },
        },
      }),
    );

    expect(html).toContain("看结果");
    expect(html).toContain('href="/p/ABC123/result"');
  });

  it("shows a direct calculation entry for local participants when participants are full", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: {
          ...planData,
          localParticipantEditToken: "edit-token",
          participants: [
            ...planData.participants,
            {
              id: "participant-2",
              name: "韩梅梅",
              departure_city_name: "上海",
              accepted_modes: ["flight" as const],
            },
          ],
        },
      }),
    );

    expect(html).toContain("人已填满，可以开始计算");
    expect(html).toContain("开始计算");
    expect(html).not.toContain("发起人还没有开始计算。");
  });
});
