import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("atmosphere design tokens", () => {
  it("defines shared shell/panel/field/cta classes in globals.css", () => {
    const css = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    for (const token of [
      "--atmosphere-ink",
      "--atmosphere-muted",
      "--atmosphere-line",
      "--app-font-display",
      "--app-font-sans-sc",
      ".atmosphere-shell",
      ".atmosphere-canvas",
      ".atmosphere-panel",
      ".atmosphere-field",
      ".atmosphere-cta",
      ".atmosphere-ghost",
      ".atmosphere-notice",
      ".font-display",
      ".font-sans-sc",
    ]) {
      expect(css).toContain(token);
    }

    expect(css).toContain("#3a4a5c");
    expect(css).toContain("#0a0c10");

    expect(css).toContain(".shell-scenic");
    expect(css).toContain(".shell-scenic-media");
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]*\.shell-scenic-media video/,
    );
  });
});
