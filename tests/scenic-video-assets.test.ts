import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { SCENIC_VIDEOS } from "@/lib/ui/scenic-videos";

describe("mobile scenic video delivery", () => {
  it("ships the high-quality same-origin MP4 files with metadata near the front", () => {
    for (const video of SCENIC_VIDEOS) {
      expect(video.src).toMatch(/^\/scenic\/[a-z-]+\.mp4$/);
      expect(video.mobileSrc).toMatch(/^\/scenic\/[a-z-]+-mobile\.mp4$/);
      const desktopPath = path.join(process.cwd(), "public", video.src);
      const mobilePath = path.join(process.cwd(), "public", video.mobileSrc);
      expect(statSync(desktopPath).size).toBeGreaterThan(10 * 1024 * 1024);
      expect(statSync(desktopPath).size).toBeLessThan(30 * 1024 * 1024);
      expect(statSync(mobilePath).size).toBeGreaterThan(5 * 1024 * 1024);
      expect(statSync(mobilePath).size).toBeLessThan(12 * 1024 * 1024);

      for (const filePath of [desktopPath, mobilePath]) {
        const openingBytes = readFileSync(filePath).subarray(0, 256 * 1024);
        expect(openingBytes.includes(Buffer.from("moov"))).toBe(true);
      }
    }
  });
});
