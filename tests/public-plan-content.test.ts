import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicPlanContent } from "@/components/plan/PublicPlanContent";
import type { PublicRunProgress } from "@/components/result/RefreshingResultNotice";

const planData = {
  plan: {
    title: "周末跨城见面测试",
    meeting_date: "2026-08-15",
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
  latestRun: null as PublicRunProgress | null,
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
    expect(html).toContain("已填写");
    expect(html).toContain("atmosphere-panel");
    expect(html).not.toContain("填写记录");
    expect(html).not.toContain("发起人还没有开始计算。");
  });

  it("keeps status in a single StatusLane panel without footer duplication", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: planData,
      }),
    );

    expect(html).toContain(
      "还差 1 位朋友。人齐之后，填过的人都能点「开始见面」。",
    );
    expect(html).not.toContain("已填写 1 人");
    expect(html).not.toContain("就等一声开算了");
    expect(html).not.toContain("暂无结果");
    expect(html.match(/atmosphere-panel/g)?.length).toBe(1);
  });

  it("saves viewed public plans into the local meeting records", () => {
    const componentSource = readFileSync(
      path.join(process.cwd(), "src/components/plan/PublicPlanContent.tsx"),
      "utf8",
    );

    expect(componentSource).toContain("rememberMeetingHistoryItem");
    expect(componentSource).toContain('role: "viewer"');
    expect(componentSource).toContain("arrivalDate: initialData.plan.meeting_date");
    expect(componentSource).not.toContain("target_arrival_time");
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

    expect(html).toContain(
      "还差 1 位朋友。人齐之后，填过的人都能点「开始见面」。",
    );
    expect(html).toContain("加入这场见面");
    expect(html).not.toContain("算出见面城市");
    expect(html).not.toContain("发起计算");
    expect(html).not.toContain("开算");
  });

  it("does not render the result action as a link before a run exists", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: planData,
      }),
    );

    expect(html).toContain("加入这场见面");
    expect(html).not.toContain("暂无结果");
    expect(html).not.toContain("结果生成中");
    expect(html).not.toContain('href="/p/ABC123/result"');
  });

  it("renders the result action as a link only after a run completes", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: {
          ...planData,
          participants: [
            ...planData.participants,
            {
              id: "participant-2",
              name: "韩梅梅",
              departure_city_name: "上海",
              accepted_modes: ["flight" as const],
            },
          ],
          latestRun: {
            runId: "run-1",
            status: "completed",
            traceId: "trace-1",
            pendingGroups: 0,
            retryAt: null,
            diagnosticCode: null,
          },
        },
      }),
    );

    expect(html).toContain("选好了，去看见面城市");
    expect(html).toContain("看结果");
    expect(html).toContain('href="/p/ABC123/result"');
    expect(html).toContain("换个城市看看");
    expect(html).not.toContain("加入这场见面");
  });

  it("links to the progress page while the calculation is running", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: {
          ...planData,
          latestRun: {
            runId: "run-1",
            status: "collecting",
            traceId: "trace-1",
            pendingGroups: 6,
            retryAt: null,
            diagnosticCode: null,
          },
        },
      }),
    );

    expect(html).toContain("正在替大家查 6 组真实车票和机票");
    expect(html).toContain("看看安排进度");
    expect(html).toContain('href="/p/ABC123/result"');
    expect(html).toContain("可以离开");
    expect(html).not.toContain("有人打开进度页时才会继续查票");
    expect(html).not.toContain("关掉页面会暂停");
    expect(html).not.toContain("结果生成中");
    expect(html).not.toContain("暂无结果");
    expect(html).not.toContain("正在生成结果");
    expect(html).not.toContain("已有结果");
    expect(html).not.toContain("省钱方案");
  });

  it("links to the progress page during validation without exposing result cards", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: {
          ...planData,
          latestRun: {
            runId: "run-1",
            status: "validating",
            traceId: "trace-1",
            pendingGroups: 0,
            retryAt: null,
            diagnosticCode: null,
          },
        },
      }),
    );

    expect(html).toContain("正在逐条确认每个人的路线真实可订");
    expect(html).toContain("看看安排进度");
    expect(html).toContain('href="/p/ABC123/result"');
    expect(html).not.toContain("省钱方案");
  });

  it("sends terminal failures to the result page for a fresh query", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: {
          ...planData,
          latestRun: {
            runId: "run-1",
            status: "failed",
            traceId: "trace-1",
            pendingGroups: 0,
            retryAt: null,
            diagnosticCode: "RUN_STALE_EXPIRED",
          },
        },
      }),
    );

    expect(html).toContain("查询暂停太久中断了");
    expect(html).toContain("去重新查询");
    expect(html).toContain('href="/p/ABC123/result"');
    expect(html).not.toContain("看看安排进度");
    expect(html).not.toContain("省钱方案");
  });

  it("advances an in-progress run from the public plan when a local participant token exists", () => {
    const componentSource = readFileSync(
      path.join(process.cwd(), "src/components/plan/PublicPlanContent.tsx"),
      "utf8",
    );

    expect(componentSource).toContain("advanceAutomaticRun");
    expect(componentSource).toContain("localParticipantEditToken");
    expect(componentSource).toContain("nextRefreshDelayMs");
  });

  it("shows a direct meetup entry for local participants when participants are full", () => {
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

    expect(html).toContain("人齐了！点一下，看看这次去哪座城见。");
    expect(html).toContain("开始见面");
    expect(html).not.toContain("开算");
    expect(html).not.toContain("发起计算");
    expect(html).not.toContain("算出见面城市");
    expect(html).not.toContain("加入这场见面");
    expect(html).not.toContain("发起人还没有开始计算。");
  });

  it("tells waiting devices to wait for a filled-in friend when full", () => {
    const html = renderToStaticMarkup(
      createElement(PublicPlanContent, {
        code: "ABC123",
        initialData: {
          ...planData,
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

    expect(html).toContain(
      "人齐了，等一位填过资料的朋友来点「开始见面」。",
    );
    expect(html).not.toContain("开算");
    expect(html).not.toContain("发起计算");
    expect(html).not.toContain("算出见面城市");
  });
});
