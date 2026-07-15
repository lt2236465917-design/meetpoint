import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AlternativeCityFlow } from "@/components/result/AlternativeCityFlow";
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
    expect(html).toContain("换个城市看看");
    expect(html).toContain("请发起人确认替换");
    expect(html).not.toContain("确认替换共享结果");
  });

  it("shows the replacement action only when this browser holds a host token", () => {
    const html = renderToStaticMarkup(createElement(AlternativeCityFlow, {
      code: "ABC123", participantToken: "participant-token", hostToken: "host-token", initialPreview: {
        runId: "run-2", status: "awaiting_host_confirmation", result: null,
      },
    }));

    expect(html).toContain("确认替换共享结果");
    expect(html).not.toContain("请发起人确认替换");
  });
});
