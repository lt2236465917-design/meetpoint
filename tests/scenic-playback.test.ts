import { describe, expect, it } from "vitest";
import {
  readScenicPlaybackPosition,
  recordScenicPlaybackPosition,
} from "@/lib/ui/scenic-playback";

describe("functional scenic playback continuity", () => {
  it("restores the last playback position for the same scene", () => {
    recordScenicPlaybackPosition("forest", 18.75);
    expect(readScenicPlaybackPosition("forest")).toBe(18.75);
  });

  it("keeps playback checkpoints isolated by scene", () => {
    recordScenicPlaybackPosition("stillWater", 7.5);
    recordScenicPlaybackPosition("dawn", 31.25);
    expect(readScenicPlaybackPosition("stillWater")).toBe(7.5);
    expect(readScenicPlaybackPosition("dawn")).toBe(31.25);
  });
});
