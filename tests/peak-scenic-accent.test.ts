import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResultContent } from "@/app/p/[code]/result/page";
import { PeakScenicAccent } from "@/components/result/PeakScenicAccent";
import { SharedRecommendation } from "@/components/result/SharedRecommendation";
import { SCENIC_VIDEOS } from "@/lib/ui/scenic-videos";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

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

describe("PeakScenicAccent (phase 4)", () => {
  it("renders a single muted looping scenic video over scenic-fallback", () => {
    const html = renderToStaticMarkup(
      createElement(PeakScenicAccent, { label: "算票等待" }, "内容"),
    );

    expect(html).toContain("peak-scenic");
    expect(html).toContain("scenic-fallback");
    expect(html).toContain("<video");
    expect(html).toContain('muted=""');
    expect(html).toContain('playsInline=""');
    expect(html).toContain('loop=""');
    expect(html).toContain(SCENIC_VIDEOS[1].src);
    expect(html).toContain("内容");
    expect(html).not.toContain("train-bob");
  });

  it("shows light scenic video on calculation-wait peaks only", () => {
    const waitHtml = renderToStaticMarkup(
      createElement(ResultContent, {
        code: "ABC123",
        title: "杭州周末见面",
        progress: {
          runId: "run-12345678",
          status: "calculating",
          traceId: "trace-1",
          pendingGroups: 2,
          retryAt: null,
          diagnosticCode: null,
        },
        result: null,
      }),
    );

    expect(waitHtml).toContain("peak-scenic");
    expect(waitHtml).toContain("<video");
    expect(waitHtml).toContain("正在挑一座对每个人都公平的城市");

    const failedHtml = renderToStaticMarkup(
      createElement(ResultContent, {
        code: "ABC123",
        title: "杭州周末见面",
        progress: {
          runId: "run-12345678",
          status: "failed",
          traceId: "trace-1",
          pendingGroups: 0,
          retryAt: null,
          diagnosticCode: "AGENT_PROPOSAL_INVALID",
        },
        result: null,
      }),
    );

    expect(failedHtml).not.toContain("peak-scenic");
    expect(failedHtml).not.toContain("<video");
  });

  it("shows light scenic video on the shared city reveal panel", () => {
    const html = renderToStaticMarkup(
      createElement(SharedRecommendation, { result }),
    );

    expect(html).toContain("peak-scenic");
    expect(html).toContain("<video");
    expect(html).toContain("这次的见面城市");
    expect(html).toContain("南京");
  });

  it("does not put scenic video behind create/join/plan shells", () => {
    const root = process.cwd();
    const sources = [
      "src/app/create/page.tsx",
      "src/components/plan/JoinParticipantForm.tsx",
      "src/components/plan/PublicPlanContent.tsx",
      "src/components/layout/ResponsiveShell.tsx",
    ].map((relative) =>
      readFileSync(path.join(root, relative), "utf8"),
    );

    for (const source of sources) {
      expect(source).not.toContain("PeakScenicAccent");
      expect(source).not.toContain("<video");
      expect(source).not.toContain("SCENIC_VIDEOS");
    }
  });

  it("defines peak-scenic styles and reduced-motion fallback in globals.css", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(css).toContain(".peak-scenic");
    expect(css).toContain(".peak-scenic-media");
    expect(css).toContain("prefers-reduced-motion");
  });
});
