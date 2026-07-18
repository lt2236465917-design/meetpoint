import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";

describe("ResponsiveShell", () => {
  it("renders an adaptive atmosphere shell without fake phone chrome", () => {
    const html = renderToStaticMarkup(
      createElement(
        ResponsiveShell,
        {
          title: "创建见面计划",
          description: "先填最少信息，发给朋友后再一起补全。",
          backHref: "/",
          backLabel: "返回上一页",
          aside: createElement("p", null, "协作状态"),
        },
        createElement("form", null, "计划表单"),
      ),
    );

    expect(html).toContain("创建见面计划");
    expect(html).toContain("计划表单");
    expect(html).toContain("协作状态");
    expect(html).toContain("atmosphere-shell");
    expect(html).toContain("atmosphere-canvas");
    expect(html).toContain("font-display");
    expect(html).toContain("min-h-svh");
    expect(html).toContain("max-w-2xl");
    expect(html).toContain("scrollbar-none");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain('href="/"');
    expect(html).toContain("返回上一页");
    expect(html).toContain("aria-label");
    expect(html).not.toContain("max-w-md");
    expect(html).not.toContain("sm:rounded-3xl");
    expect(html).not.toContain("sm:h-[min(860px,calc(100svh-3rem))]");
    expect(html).not.toContain("bg-slate-100");
    expect(html).not.toContain("bg-white shadow-sm");
    expect(html).not.toContain("lg:grid-cols");
    expect(html).not.toContain("lg:sticky");
  });

  it("renders a light scenic backdrop only when scenic is enabled", () => {
    const withScenic = renderToStaticMarkup(
      createElement(ResponsiveShell, { title: "计划", scenic: true }, "body"),
    );
    const without = renderToStaticMarkup(
      createElement(ResponsiveShell, { title: "创建" }, "body"),
    );

    expect(withScenic).toContain("shell-scenic");
    expect(without).not.toContain("shell-scenic");
  });
});
