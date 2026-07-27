import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { IcpFooter } from "@/components/legal/IcpFooter";
import { resolveScenicAssetUrl } from "@/lib/ui/scenic-videos";

describe("mainland production domain", () => {
  it("renders the approved ICP filing link without personal filing details", () => {
    const html = renderToStaticMarkup(createElement(IcpFooter));

    expect(html).toContain("京ICP备2026025115号-3");
    expect(html).toContain("https://beian.miit.gov.cn/");
    expect(html).not.toContain("身份证");
    expect(html).not.toContain("手机号");
  });

  it("uses same-origin scenic paths by default and a configured CDN without double slashes", () => {
    expect(resolveScenicAssetUrl("", "/scenic/dawn.mp4")).toBe(
      "/scenic/dawn.mp4",
    );
    expect(
      resolveScenicAssetUrl(
        "https://media.meetpoint.space/",
        "/scenic/dawn.mp4",
      ),
    ).toBe("https://media.meetpoint.space/scenic/dawn.mp4");
  });

  it("redirects the apex domain to the filed www canonical host", async () => {
    const nginx = await readFile(
      path.join(process.cwd(), "deploy/aliyun/meetpoint.nginx.conf.template"),
      "utf8",
    );

    expect(nginx).toContain("server_name meetpoint.space;");
    expect(nginx).toContain(
      "return 301 https://www.meetpoint.space$request_uri;",
    );
    expect(nginx).toContain("server_name www.meetpoint.space;");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3001;");
  });

  it("does not depend on Google Fonts for mainland rendering", async () => {
    const globalStyles = await readFile(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(globalStyles).not.toContain("fonts.googleapis.com");
    expect(globalStyles).not.toContain("fonts.gstatic.com");
  });
});
