import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const gatewayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("gateway container configuration", () => {
  it("builds a production image with the required runtime policy", async () => {
    const dockerfile = await readFile(path.join(gatewayRoot, "Dockerfile"), "utf8");

    expect(dockerfile).toMatch(/^FROM node:20-slim AS build$/m);
    expect(dockerfile).toMatch(/\bRUN npm ci\b/);
    expect(dockerfile).toMatch(/\bRUN npm run build\b/);
    expect(dockerfile).toMatch(/\bRUN npm prune --omit=dev\b/);
    expect(dockerfile).toMatch(/^USER node$/m);
    expect(dockerfile).toMatch(/^EXPOSE 8080$/m);
    expect(dockerfile).toMatch(/^CMD \["node", "dist\/server\.js"\]$/m);
  });

  it("does not bake gateway secrets into build arguments or environment variables", async () => {
    const dockerfile = await readFile(path.join(gatewayRoot, "Dockerfile"), "utf8");

    expect(dockerfile).not.toMatch(/^\s*(?:ARG|ENV)\b/im);
    expect(dockerfile).not.toMatch(/(?:FLYAI|AMADEUS|API[_-]?KEY|TOKEN|SECRET|PASSWORD)/i);
  });
});
