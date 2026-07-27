import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("RootLayout", () => {
  it("suppresses one-level WebView body attribute hydration noise", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    expect(source).toContain("suppressHydrationWarning");
  });

  it("disables mobile browser auto-detection that can rewrite server HTML", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    expect(source).toContain("formatDetection");
    expect(source).toContain("telephone: false");
    expect(source).toContain("date: false");
    expect(source).toContain("email: false");
    expect(source).toContain("address: false");
    expect(source).toContain('"x5-video-player-type": "h5"');
    expect(source).toContain('"x5-playsinline": "true"');
  });
});
