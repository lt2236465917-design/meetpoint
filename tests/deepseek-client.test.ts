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

  it("limits each DeepSeek request to 15 seconds", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const { createDeepSeekClient } = await import("@/lib/ai/deepseek-client");

    expect(createDeepSeekClient()?.timeout).toBe(15_000);
  });

  it("limits DeepSeek retries to one", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-key");
    const { createDeepSeekClient } = await import("@/lib/ai/deepseek-client");

    expect(createDeepSeekClient()?.maxRetries).toBe(1);
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
