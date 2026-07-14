import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Next development configuration", () => {
  it("allows the local browser origin used for H5 acceptance", () => {
    const config = readFileSync(
      path.join(process.cwd(), "next.config.ts"),
      "utf8",
    );

    expect(config).toContain('"127.0.0.1"');
  });
});
