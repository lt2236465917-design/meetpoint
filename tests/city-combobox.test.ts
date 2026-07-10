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
});
