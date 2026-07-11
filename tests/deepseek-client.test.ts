import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("DeepSeek configuration", () => {
  it("does not create a client without an API key", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    const { createDeepSeekClient } = await import("@/lib/ai/deepseek-client");
    expect(createDeepSeekClient()).toBeNull();
  });

  it("uses deepseek-v4-flash by default", async () => {
    vi.stubEnv("DEEPSEEK_MODEL", "");
    const { getDeepSeekModel } = await import("@/lib/ai/deepseek-client");
    expect(getDeepSeekModel()).toBe("deepseek-v4-flash");
  });

  it("uses the configured model override", async () => {
    vi.stubEnv("DEEPSEEK_MODEL", "deepseek-v4-pro");
    const { getDeepSeekModel } = await import("@/lib/ai/deepseek-client");
    expect(getDeepSeekModel()).toBe("deepseek-v4-pro");
  });
});
