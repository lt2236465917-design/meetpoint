import { createElement } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders a full-bleed zero-scroll hero with CTA and records entry", () => {
    const html = renderToStaticMarkup(createElement(HomePage));
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/page.tsx"),
      "utf8",
    );

    expect(html).toContain("meetpoint");
    expect(html).not.toContain(">跨城见面<");
    expect(html).toContain("散在几座城的朋友");
    expect(html).toContain("发起见面计划");
    expect(html).toContain('href="/create"');
    expect(html).toContain("hero-cta");
    expect(html).toContain("readable-title");
    expect(html).toContain("train-bob");
    expect(html).toContain("最近记录");
    expect(html).toContain('href="/records"');
    expect(html).toContain("h-svh");
    expect(html).toContain("overflow-hidden");
    expect(html).not.toContain("最近见面记录");
    expect(html).not.toContain("max-w-md");
    expect(html).not.toContain("sm:rounded-3xl");
    expect(pageSource).not.toContain("RecentMeetingRecords");
  });

  it("does not ship preview-only chrome or calculator framing", () => {
    const html = renderToStaticMarkup(createElement(HomePage));
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/page.tsx"),
      "utf8",
    );
    const heroSource = readFileSync(
      path.join(process.cwd(), "src/components/home/HomeHero.tsx"),
      "utf8",
    );

    expect(html).not.toContain("预览 · 未接入产品");
    expect(html).not.toContain("Lumora");
    expect(html).not.toContain("一键开算");
    expect(html).not.toContain("开算");
    expect(pageSource + heroSource).not.toContain("window.alert");
    // Remount after /records must reveal the persisted active scene (any index).
    expect(heroSource).toMatch(/setSceneReady\(true\)/);
    expect(heroSource).not.toMatch(
      /if \(index === 0\) set(?:First)?SceneReady\(true\)/,
    );
    // Do not read localStorage in useState — that hydrates wrong and spawns a
    // Next.js error overlay that intercepts clicks on later routes.
    expect(heroSource).not.toMatch(/useState\(\s*readScenicSceneIndex\s*\)/);
    expect(heroSource).toContain("useSyncExternalStore(");
    expect(heroSource).toMatch(/function getServerScenicSceneSnapshot\(\)[\s\S]*return 0;/);
  });
});
