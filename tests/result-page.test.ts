import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResultContent } from "@/app/p/[code]/result/page";
import {
  advanceAutomaticRun,
  nextRefreshDelayMs,
  restartAutomaticRun,
} from "@/components/result/RefreshingResultNotice";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const baseProgress = {
  runId: "run-12345678",
  traceId: "trace-87654321",
  pendingGroups: 8,
  retryAt: null,
  diagnosticCode: null,
};

function renderStatus(
  status:
    | "pending"
    | "collecting"
    | "cooling_down"
    | "calculating"
    | "validating"
    | "awaiting_host_confirmation"
    | "incomplete"
    | "failed",
  overrides: Partial<typeof baseProgress> = {},
) {
  return renderToStaticMarkup(
    createElement(ResultContent, {
      code: "ABC123",
      title: "杭州周末见面",
      progress: { ...baseProgress, ...overrides, status },
      result: null,
      baseline: {
        cityCode: "wuhan",
        cityName: "武汉",
        policyVersion: "2026-08-01.baseline.v1",
        evidenceLevel: "canonical_coordinates_and_hubs",
        inputFingerprint: "a".repeat(64),
      },
      now: new Date("2026-07-15T10:00:00.000Z"),
    }),
  );
}

describe("result page public states", () => {
  it("keeps polling after the initial backoff ladder so long collections can finish", () => {
    expect(nextRefreshDelayMs(0)).toBe(2_000);
    expect(nextRefreshDelayMs(5)).toBe(21_000);
    expect(nextRefreshDelayMs(6)).toBe(21_000);
    expect(nextRefreshDelayMs(40)).toBe(21_000);
  });

  it("advances a nonterminal automatic run with the stored participant token", async () => {
    const request = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(advanceAutomaticRun({
      code: "ABC123",
      runId: "run-12345678",
      participantToken: "participant-token",
      request,
    })).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      "/api/plans/ABC123/runs/run-12345678/advance",
      {
        method: "POST",
        headers: { "x-participant-token": "participant-token" },
      },
    );
  });

  it("creates a fresh automatic run when retrying a terminal result", async () => {
    const request = vi.fn(async () => new Response(null, { status: 202 }));

    await expect(restartAutomaticRun({
      code: "ABC123",
      participantToken: "participant-token",
      request,
    })).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(
      "/api/plans/ABC123/calculate",
      {
        method: "POST",
        headers: { "x-participant-token": "participant-token" },
      },
    );
  });

  it.each(["pending", "collecting"] as const)(
    "shows remaining real-fare groups while %s",
    (status) => {
      const html = renderStatus(status);

      expect(html).toContain("正在替大家查 8 组真实车票和机票");
      expect(html).toContain("可以离开");
      expect(html).not.toContain("请保持本页打开");
      expect(html).toContain("刷新结果");
      expect(html).not.toContain("省钱方案");
      expect(html).not.toContain("省时方案");
      expect(html).toContain("先在这里见");
      expect(html).toContain("武汉");
      expect(html).toContain("真实票价还在确认");
    },
  );

  it("tells waiting users they can leave while querying continues", () => {
    const html = renderStatus("collecting");
    expect(html).toContain("可以离开");
    expect(html).not.toContain("请保持本页打开");
    expect(html).not.toContain("关掉页面会暂停");
  });

  it("shows the bounded supplier cooldown", () => {
    const html = renderStatus("cooling_down", {
      retryAt: "2026-07-15T10:00:12.000Z",
    });

    expect(html).toContain("票务平台有点忙，12 秒后自动再试");
    expect(html).not.toContain("省钱方案");
    expect(html).toContain("武汉");
    expect(html).not.toMatch(/¥|￥|元\/人/);
  });

  it("shows calculation progress without result cards", () => {
    const html = renderStatus("calculating");

    expect(html).toContain("正在挑一座对每个人都公平的城市");
    expect(html).not.toContain("省钱方案");
  });

  it("shows validation progress without result cards", () => {
    const html = renderStatus("validating");

    expect(html).toContain("正在逐条确认每个人的路线真实可订");
    expect(html).not.toContain("省时方案");
  });

  it("does not expose a private alternative preview on the shared route", () => {
    const html = renderStatus("awaiting_host_confirmation");

    expect(html).toContain("替代城市正在等待发起人确认");
    expect(html).not.toContain("仅你可见的预览");
    expect(html).not.toContain("省钱方案");
  });

  it("shows retry guidance and a diagnostic id for incomplete coverage", () => {
    const html = renderStatus("incomplete", {
      diagnosticCode: "REAL_QUOTE_COVERAGE_INCOMPLETE",
    });

    expect(html).toContain("有几位朋友的票价没查全，过一会再试一次");
    expect(html).toContain("重新查询");
    expect(html).toContain("返回计划页");
    expect(html).not.toContain("刷新结果");
    expect(html).toContain("诊断编号 RUN-12345678");
    expect(html).not.toContain("省钱方案");
  });

  it("shows actionable failed-state guidance", () => {
    const html = renderStatus("failed", {
      diagnosticCode: "AGENT_PROPOSAL_INVALID",
    });

    expect(html).toContain("真实票价这次没查完，稍后再试一次");
    expect(html).toContain("把下面这串编号发给发起人");
    expect(html).toContain("诊断编号 RUN-12345678");
    expect(html).toContain("重新查询");
    expect(html).toContain("返回计划页");
    expect(html).not.toContain("刷新结果");
    expect(html).not.toContain("省钱方案");
  });

  it("explains stale expiry as system interruption, not a keep-page-open duty", () => {
    const html = renderStatus("failed", {
      diagnosticCode: "RUN_STALE_EXPIRED",
    });

    expect(html).toContain("查询暂停太久中断了");
    expect(html).toContain("后台服务");
    expect(html).not.toContain("请保持本页打开");
    expect(html).toContain("重新查询");
    expect(html).not.toContain("开算");
  });

  it("renders no recommendation before a run exists", () => {
    const html = renderToStaticMarkup(
      createElement(ResultContent, {
        code: "ABC123",
        title: "杭州周末见面",
        progress: null,
        result: null,
      }),
    );

    expect(html).toContain("还没有见面结果");
    expect(html).not.toContain("还没有计算结果");
    expect(html).not.toContain("省钱方案");
  });

  it("asks users to restart meetup from the plan when the result is incomplete", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/p/[code]/result/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain(
      "结果不完整，请回计划页再点一次「开始见面」",
    );
    expect(pageSource).not.toContain("请返回计划页重新计算");
  });
});
