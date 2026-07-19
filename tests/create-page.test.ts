import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CreatePlanPage from "@/app/create/page";

describe("CreatePlanPage", () => {
  it("renders clear labels for every plan setup control", () => {
    const html = renderToStaticMarkup(createElement(CreatePlanPage));

    expect(html).toContain("计划名称");
    expect(html).toContain("计划到达日期");
    expect(html).not.toContain("目标到达时间");
    expect(html).toContain("参与人数上限");
  });

  it("does not fall back to a query-string GET submission on mobile browsers", () => {
    const html = renderToStaticMarkup(createElement(CreatePlanPage));

    expect(html).toContain('method="dialog"');
    expect(html).not.toContain('method="get"');
  });

  it("keeps participant limit options in the form flow instead of covering earlier fields", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/create/page.tsx"),
      "utf8",
    );

    expect(pageSource).not.toContain("absolute bottom-full");
    expect(pageSource).toContain(
      'className="atmosphere-panel mt-2 w-full overflow-hidden rounded-lg p-1"',
    );
  });

  it("saves a created plan into the local meeting records", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/create/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("rememberMeetingHistoryItem");
    expect(pageSource).toContain('role: "host"');
    expect(pageSource).not.toContain("manageToken: json.manageToken");
  });

  it("copies the public link instead of sending the host away from the success screen", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/create/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("复制公开链接");
    expect(pageSource).toContain("copyTextToClipboard");
    expect(pageSource).not.toContain("打开公开链接");
  });

  it("renders the public link without exposing a backup management token", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/create/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("参与填写链接");
    expect(pageSource).not.toContain("备用管理口令");
    expect(pageSource).not.toContain("管理口令只出现一次");
    expect(pageSource).not.toContain("font-mono");
  });
});
