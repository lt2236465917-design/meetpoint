import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CityCombobox } from "@/components/forms/CityCombobox";

describe("CityCombobox", () => {
  it("does not render city candidates after a city has been selected", () => {
    const html = renderToStaticMarkup(
      createElement(CityCombobox, {
        label: "出发城市",
        value: { code: "beijing", name: "北京" },
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain('value="北京"');
    expect(html).not.toContain("北京 · 北京");
  });

  it("uses a departure-friendly placeholder by default", () => {
    const html = renderToStaticMarkup(
      createElement(CityCombobox, {
        value: null,
        onChange: vi.fn(),
      }),
    );

    expect(html).toContain("输入城市名，如 北京 / 湛江");
  });

  it("documents an empty-search hint for unknown city names", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/forms/CityCombobox.tsx"),
      "utf8",
    );

    expect(source).toContain("searchedEmpty");
    expect(source).toContain("没找到这个市，试试完整市名，如「湛江」");
  });

  it("debounces remote city lookup and shows search feedback", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/forms/CityCombobox.tsx"),
      "utf8",
    );

    expect(source).toContain("debouncedQuery");
    expect(source).toContain("正在查找城市…");
  });
});
