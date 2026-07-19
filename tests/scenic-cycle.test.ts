import { describe, expect, it } from "vitest";
import {
  nextScenicVideoIndex,
  shouldAdvanceScenicVideo,
} from "@/lib/ui/scenic-cycle";

describe("home scenic cycle", () => {
  it("advances just before the final frame when ended is not delivered", () => {
    expect(shouldAdvanceScenicVideo({
      currentTime: 9.82,
      duration: 10.04,
      ended: false,
    })).toBe(true);
  });

  it("does not advance during normal playback", () => {
    expect(shouldAdvanceScenicVideo({
      currentTime: 8,
      duration: 10.04,
      ended: false,
    })).toBe(false);
  });

  it("cycles from the final scene back to the first", () => {
    expect(nextScenicVideoIndex(3, 4)).toBe(0);
    expect(nextScenicVideoIndex(1, 4)).toBe(2);
  });
});
