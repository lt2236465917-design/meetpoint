import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  AlternativeCityFlow,
  requestAlternativePreview,
} from "@/components/result/AlternativeCityFlow";
import { PublicPlanContent } from "@/components/plan/PublicPlanContent";

const completedPlan = {
  plan: { title: "跨城见面", meeting_date: "2026-08-15", participant_limit: 2 },
  participants: [
    { id: "p1", name: "李雷", departure_city_name: "北京", accepted_modes: ["flight" as const] },
    { id: "p2", name: "韩梅梅", departure_city_name: "上海", accepted_modes: ["flight" as const] },
  ],
  latestRun: { runId: "run-1", status: "completed" as const, traceId: "trace-1", pendingGroups: 0, retryAt: null, diagnosticCode: null },
};

describe("alternative city mobile flow", () => {
  it("adds the alternative-city entry only after a completed shared result", () => {
    const html = renderToStaticMarkup(createElement(PublicPlanContent, {
      code: "ABC123", initialData: completedPlan,
    }));

    expect(html).toContain("换个城市看看");
    expect(html).toContain('href="/p/ABC123/alternatives"');
  });

  it("labels a participant preview as private and asks the host to confirm", () => {
    const html = renderToStaticMarkup(createElement(AlternativeCityFlow, {
      code: "ABC123", participantToken: "participant-token", hostToken: "", initialPreview: null,
    }));

    expect(html).toContain("仅你可见的预览");
    expect(html).toContain("挑一座想去的城市");
    expect(html).not.toContain("请发起人确认替换");
    expect(html).not.toContain("确认替换共享结果");
  });

  it("keeps an incomplete private preview visible and actionable after reload", () => {
    const html = renderToStaticMarkup(createElement(AlternativeCityFlow, {
      code: "ABC123",
      participantToken: "participant-token",
      hostToken: "",
      initialPreview: {
        runId: "run-failed",
        status: "incomplete",
        requestedCityCode: "zhanjiang",
        requestedCityName: "湛江",
        diagnosticCode: "REAL_QUOTE_COVERAGE_INCOMPLETE",
        result: null,
      },
    }));

    expect(html).toContain("湛江");
    expect(html).toContain("有几位朋友的票价没查全");
    expect(html).toContain("重新查询这座城");
    expect(html).not.toContain("请发起人确认替换");
  });

  it("keeps a failed private preview visible with safe diagnostics", () => {
    const html = renderToStaticMarkup(createElement(AlternativeCityFlow, {
      code: "ABC123",
      participantToken: "participant-token",
      hostToken: "",
      initialPreview: {
        runId: "run-12345678",
        status: "failed",
        requestedCityCode: "wuhan",
        requestedCityName: "武汉",
        diagnosticCode: "PUBLICATION_GUARD_REJECTED",
        result: null,
      },
    }));

    expect(html).toContain("武汉这次没安排成");
    expect(html).toContain("诊断编号 RUN-12345678");
    expect(html).toContain("重新查询这座城");
    expect(html).not.toContain("请发起人确认替换");
  });

  it("shows the replacement action only when this browser holds a host token", () => {
    const html = renderToStaticMarkup(createElement(AlternativeCityFlow, {
      code: "ABC123", participantToken: "participant-token", hostToken: "host-token", initialPreview: {
        runId: "run-2",
        status: "awaiting_host_confirmation",
        requestedCityCode: "wuhan",
        requestedCityName: "武汉",
        result: null,
      },
    }));

    expect(html).toContain("确认替换共享结果");
    expect(html).not.toContain("请发起人确认替换");
  });

  it("retries through a new preview request instead of advancing the terminal run", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      disposition: "created",
      runId: "run-new",
      status: "pending",
    }), { status: 202 }));

    await requestAlternativePreview({
      code: "ABC123",
      participantToken: "participant-token",
      city: { code: "wuhan", name: "武汉" },
      request,
    });

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("/api/plans/ABC123/previews", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-participant-token": "participant-token",
      },
      body: JSON.stringify({ cityCode: "wuhan", cityName: "武汉" }),
    });
  });
});
