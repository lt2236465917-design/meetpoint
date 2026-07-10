import { describe, expect, it } from "vitest";
import { formatTransportModes } from "@/lib/ui/transport-modes";

describe("formatTransportModes", () => {
  it("formats internal transport mode values as Chinese user-facing labels", () => {
    expect(formatTransportModes(["flight", "high_speed_rail"])).toBe(
      "飞机 / 高铁/动车",
    );
  });
});
