import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

describe("Alibaba Cloud ECS deployment configuration", () => {
  it("builds the frontend as an unprivileged production image without server secrets", async () => {
    const dockerfile = await read("Dockerfile");

    expect(dockerfile).toMatch(/^FROM node:20-slim AS build$/m);
    expect(dockerfile).toMatch(/\bRUN npm ci\b/);
    expect(dockerfile).toMatch(/\bRUN npm run build\b/);
    expect(dockerfile).toMatch(/\bRUN npm prune --omit=dev\b/);
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^EXPOSE 3000$/m);
    expect(dockerfile).toMatch(/^CMD \["npm", "start"\]$/m);
    expect(dockerfile).toMatch(/^ARG NEXT_PUBLIC_SCENIC_BASE_URL$/m);
    expect(dockerfile).not.toMatch(/(?:SERVICE_ROLE|DEEPSEEK|AMAP_API_KEY|TRAVEL_GATEWAY_TOKEN|FLYAI_API_KEY)/);
  });

  it("keeps the frontend loopback-only and the gateway private", async () => {
    const compose = await read("deploy/aliyun/compose.yaml");
    const gatewaySection = compose.split(/^  travel-gateway:/m)[1] ?? "";

    expect(compose).toContain('"127.0.0.1:3001:3000"');
    expect(compose).toContain("TRAVEL_GATEWAY_URL: http://travel-gateway:8080");
    expect(compose).toContain(
      "NEXT_PUBLIC_SCENIC_BASE_URL: ${NEXT_PUBLIC_SCENIC_BASE_URL:?required}",
    );
    expect(compose).toContain("TRAVEL_GATEWAY_TOKEN: ${TRAVEL_GATEWAY_TOKEN:?required}");
    expect(gatewaySection).not.toMatch(/^\s+ports:/m);
    expect(gatewaySection).toContain("test: [\"CMD\", \"node\", \"-e\", \"fetch('http://127.0.0.1:8080/healthz')");
  });

  it("commits placeholders and excludes local or secret-heavy build inputs", async () => {
    const [envExample, dockerignore] = await Promise.all([
      read("deploy/aliyun/production.env.example"),
      read(".dockerignore"),
    ]);

    expect(envExample).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(envExample).toContain("FLYAI_API_KEY=");
    expect(envExample).not.toMatch(/=\S+/);
    expect(dockerignore).toMatch(/^\.env\*$/m);
    expect(dockerignore).toMatch(/^node_modules$/m);
    expect(dockerignore).toMatch(/^public\/scenic$/m);
    expect(dockerignore).toMatch(/^services\/travel-provider-gateway\/\.env\*$/m);
    expect(dockerignore).toMatch(/^services\/travel-provider-gateway\/node_modules$/m);
  });
});
