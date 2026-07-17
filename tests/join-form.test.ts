import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JoinParticipantForm } from "@/components/plan/JoinParticipantForm";

describe("JoinParticipantForm", () => {
  it("renders clear labels for participant name and departure city", () => {
    const html = renderToStaticMarkup(
      createElement(JoinParticipantForm, {
        name: "",
        city: null,
        acceptedModes: ["high_speed_rail"],
        loading: false,
        message: "",
        onNameChange: vi.fn(),
        onCityChange: vi.fn(),
        onAcceptedModesChange: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(html).toContain("你的名字");
    expect(html).toContain("出发城市");
  });

  it("shows a return-to-plan action after successful submission", () => {
    const html = renderToStaticMarkup(
      createElement(JoinParticipantForm, {
        code: "ABC123",
        name: "",
        city: null,
        acceptedModes: ["high_speed_rail"],
        loading: false,
        submitted: true,
        message: "已提交，可以返回计划页查看进度。",
        onNameChange: vi.fn(),
        onCityChange: vi.fn(),
        onAcceptedModesChange: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(html).toContain("返回计划页");
    expect(html).toContain("/p/ABC123");
  });

  it("makes successful submission feedback clear while returning to the public plan", () => {
    const html = renderToStaticMarkup(
      createElement(JoinParticipantForm, {
        code: "ABC123",
        name: "",
        city: null,
        acceptedModes: ["high_speed_rail"],
        loading: false,
        submitted: true,
        message: "你已加入这场见面！正在回到计划页，看看还差谁。",
        onNameChange: vi.fn(),
        onCityChange: vi.fn(),
        onAcceptedModesChange: vi.fn(),
        onSubmit: vi.fn(),
      }),
    );

    expect(html).toContain("你已加入这场见面");
    expect(html).toContain("正在回到计划页");
  });

  it("returns to the public plan automatically after a successful submission", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/p/[code]/join/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("router.replace(`/p/${code}`)");
  });

  it("saves a joined plan into the local meeting records", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/p/[code]/join/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("rememberMeetingHistoryItem");
    expect(pageSource).toContain('role: "participant"');
    expect(pageSource).toContain("participantEditToken: json.editToken");
  });
});
