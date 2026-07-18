import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RecordsPage from "@/app/records/page";

describe("RecordsPage", () => {
  it("renders recent meeting records in the adaptive shell", () => {
    const html = renderToStaticMarkup(createElement(RecordsPage));

    expect(html).toContain("最近见面记录");
    expect(html).toContain("还没有见面记录");
    expect(html).toContain("atmosphere-shell");
    expect(html).toContain("atmosphere-canvas");
    expect(html).toContain("max-w-2xl");
    expect(html).toContain('href="/"');
    expect(html).toContain("返回首页");
    expect(html).not.toContain("max-w-md");
  });
});
