import { describe, expect, it } from "vitest";
import { generateToken, hashToken, verifyToken } from "@/lib/security/tokens";

describe("token utilities", () => {
  it("generates url-safe high-entropy tokens", () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  });

  it("verifies a matching token and rejects a different token", async () => {
    const token = "host-secret-token";
    const hash = await hashToken(token);
    await expect(verifyToken(token, hash)).resolves.toBe(true);
    await expect(verifyToken("wrong-token", hash)).resolves.toBe(false);
  });
});
