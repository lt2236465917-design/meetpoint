import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { startScenicPlayback } from "@/lib/ui/scenic-autoplay";

describe("mobile scenic autoplay recovery", () => {
  it("does not permanently hide every functional backdrop after a recoverable media error", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/layout/ShellScenicBackdrop.tsx"),
      "utf8",
    );

    expect(source).toContain('className="scenic-fallback absolute inset-0"');
    expect(source).not.toContain('style.display = "none"');
  });

  it("retries a rejected autoplay on the first touch and stops listening after success", async () => {
    const target = new EventTarget();
    const play = vi.fn()
      .mockRejectedValueOnce(new Error("NotAllowedError"))
      .mockResolvedValue(undefined);
    const onStarted = vi.fn();

    const cleanup = startScenicPlayback(
      { play },
      { target, onStarted },
    );
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    target.dispatchEvent(new Event("touchstart"));
    await vi.waitFor(() => {
      expect(play).toHaveBeenCalledTimes(2);
      expect(onStarted).toHaveBeenCalledTimes(1);
    });

    target.dispatchEvent(new Event("pointerdown"));
    expect(play).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it("keeps retry listeners armed when a user-gesture play is also rejected", async () => {
    const target = new EventTarget();
    const play = vi.fn()
      .mockRejectedValueOnce(new Error("autoplay blocked"))
      .mockRejectedValueOnce(new Error("gesture blocked"))
      .mockResolvedValue(undefined);

    const cleanup = startScenicPlayback({ play }, { target });
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));

    target.dispatchEvent(new Event("touchstart"));
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    target.dispatchEvent(new Event("touchstart"));
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(3));
    cleanup();
  });
});
