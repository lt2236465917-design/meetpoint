import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "@/lib/ui/clipboard";

describe("copyTextToClipboard", () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: originalDocument,
    });
  });

  it("uses the modern clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText } },
    });

    await expect(copyTextToClipboard("https://example.test/p/ABC123")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("https://example.test/p/ABC123");
  });

  it("falls back to a temporary textarea when clipboard API is unavailable", async () => {
    const textArea = {
      value: "",
      setAttribute: vi.fn(),
      select: vi.fn(),
      style: {},
    };
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        body: { appendChild, removeChild },
        createElement: vi.fn().mockReturnValue(textArea),
        execCommand,
      },
    });

    await expect(copyTextToClipboard("https://example.test/p/ABC123")).resolves.toBe(true);
    expect(textArea.value).toBe("https://example.test/p/ABC123");
    expect(appendChild).toHaveBeenCalledWith(textArea);
    expect(textArea.select).toHaveBeenCalled();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(removeChild).toHaveBeenCalledWith(textArea);
  });
});
