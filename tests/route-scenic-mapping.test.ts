import { describe, expect, it } from "vitest";
import { functionalScenicScene } from "@/lib/ui/functional-scenic";

const routeScenes = [
  ["/create", "stillWater"],
  ["/records", "dawn"],
  ["/p/ABCD", "forest"],
  ["/p/ABCD/join", "stillWater"],
  ["/p/ABCD/result", "dawn"],
  ["/p/ABCD/alternatives", "stillWater"],
  ["/p/ABCD/manage", "forest"],
] as const;

describe("functional route scenic mapping", () => {
  it.each(routeScenes)("assigns %s to %s", (pathname, scene) => {
    expect(functionalScenicScene(pathname)).toBe(scene);
  });

  it("does not cover the four-video home hero", () => {
    expect(functionalScenicScene("/")).toBeNull();
  });
});
