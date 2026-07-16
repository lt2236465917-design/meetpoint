import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResultContent } from "@/app/p/[code]/result/page";
import { advanceAutomaticRun } from "@/components/result/RefreshingResultNotice";

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
      now: new Date("2026-07-15T10:00:00.000Z"),
    }),
  );
}

describe("result page public states", () => {
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

  it.each(["pending", "collecting"] as const)(
    "shows remaining real-fare groups while %s",
    (status) => {
      const html = renderStatus(status);

      expect(html).toContain("正在查询 8 组真实票价");
      expect(html).toContain("刷新结果");
      expect(html).not.toContain("省钱方案");
      expect(html).not.toContain("省时方案");
    },
  );

  it("shows the bounded supplier cooldown", () => {
    const html = renderStatus("cooling_down", {
      retryAt: "2026-07-15T10:00:12.000Z",
    });

    expect(html).toContain("供应商限流，12 秒后自动重试");
    expect(html).not.toContain("省钱方案");
  });

  it("shows calculation progress without result cards", () => {
    const html = renderStatus("calculating");

    expect(html).toContain("正在计算一城两方案");
    expect(html).not.toContain("省钱方案");
  });

  it("shows validation progress without result cards", () => {
    const html = renderStatus("validating");

    expect(html).toContain("正在核验全员路线");
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

    expect(html).toContain("未生成推荐");
    expect(html).toContain("真实票价覆盖不完整，尚未生成推荐");
    expect(html).toContain("可以重新计算");
    expect(html).toContain("诊断编号 RUN-12345678");
    expect(html).not.toContain("省钱方案");
  });

  it("shows actionable failed-state guidance", () => {
    const html = renderStatus("failed", {
      diagnosticCode: "AGENT_PROPOSAL_INVALID",
    });

    expect(html).toContain("生成失败");
    expect(html).toContain("请返回计划页重新计算");
    expect(html).toContain("诊断编号 RUN-12345678");
    expect(html).not.toContain("省钱方案");
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

    expect(html).toContain("还没有计算结果");
    expect(html).not.toContain("省钱方案");
  });
});
