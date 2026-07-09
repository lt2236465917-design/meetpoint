import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";

describe("ResponsiveShell", () => {
  it("renders a mobile-first page as a centered H5 canvas on desktop", () => {
    const html = renderToStaticMarkup(
      createElement(
        ResponsiveShell,
        {
          title: "创建见面计划",
          description: "先填最少信息，发给朋友后再一起补全。",
          aside: createElement("p", null, "协作状态"),
        },
        createElement("form", null, "计划表单"),
      ),
    );

    expect(html).toContain("创建见面计划");
    expect(html).toContain("计划表单");
    expect(html).toContain("协作状态");
    expect(html).toContain("items-center");
    expect(html).toContain("justify-center");
    expect(html).toContain("h-svh");
    expect(html).toContain("max-w-md");
    expect(html).toContain("scrollbar-none");
    expect(html).toContain("overflow-y-auto");
    expect(html).not.toContain("lg:grid-cols");
    expect(html).not.toContain("lg:sticky");
  });
});
