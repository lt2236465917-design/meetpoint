import { describe, expect, it } from "vitest";
import {
  calendarDateInShanghai,
  createPlanSchema,
} from "@/lib/validation/schemas";

describe("createPlanSchema", () => {
  const input = {
    title: "周末跨城见面测试",
    participantLimit: 4,
  };

  it("rejects arrival dates before the supplied Shanghai calendar day", () => {
    const parsed = createPlanSchema("2026-07-19").safeParse({
      ...input,
      arrivalDate: "2026-07-18",
    });

    expect(parsed.success).toBe(false);
  });

  it("allows today and future arrival dates", () => {
    expect(createPlanSchema("2026-07-19").safeParse({
      ...input,
      arrivalDate: "2026-07-19",
    }).success).toBe(true);
    expect(createPlanSchema("2026-07-19").safeParse({
      ...input,
      arrivalDate: "2026-07-20",
    }).success).toBe(true);
  });

  it("rejects calendar-shaped dates that do not exist", () => {
    expect(createPlanSchema("2026-01-01").safeParse({
      ...input,
      arrivalDate: "2026-02-29",
    }).success).toBe(false);
    expect(createPlanSchema("2026-01-01").safeParse({
      ...input,
      arrivalDate: "2026-02-31",
    }).success).toBe(false);
    expect(createPlanSchema("2028-01-01").safeParse({
      ...input,
      arrivalDate: "2028-02-29",
    }).success).toBe(true);
  });

  it("derives calendar dates in Asia/Shanghai", () => {
    expect(calendarDateInShanghai(new Date("2026-07-18T16:30:00.000Z")))
      .toBe("2026-07-19");
  });
});
