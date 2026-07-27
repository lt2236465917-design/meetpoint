import { describe, expect, it } from "vitest";
import { parseCreatePlanForm } from "@/lib/ui/create-plan-form";

describe("parseCreatePlanForm", () => {
  it("uses the submitted arrival date", () => {
    const formData = new FormData();
    formData.set("title", "周末跨城见面测试");
    formData.set("arrivalDate", "2026-08-15");
    formData.set("participantLimit", "4");

    expect(parseCreatePlanForm(formData)).toEqual({
      ok: true,
      data: {
        title: "周末跨城见面测试",
        arrivalDate: "2026-08-15",
        participantLimit: 4,
      },
    });
  });

  it("converts a native select option string into a valid participant limit", () => {
    const formData = new FormData();
    formData.set("title", "周末跨城见面测试");
    formData.set("arrivalDate", "2026-08-15");
    formData.set("participantLimit", "5");

    expect(parseCreatePlanForm(formData)).toMatchObject({
      ok: true,
      data: { participantLimit: 5 },
    });
  });

  it("rejects a fractional participant limit before submission", () => {
    const formData = new FormData();
    formData.set("title", "周末跨城见面测试");
    formData.set("arrivalDate", "2026-08-15");
    formData.set("participantLimit", "2.5");

    expect(parseCreatePlanForm(formData)).toEqual({
      ok: false,
      error: "参与人数需在 2-6 人之间",
    });
  });

  it("returns the first actionable validation message", () => {
    const formData = new FormData();
    formData.set("title", "周末跨城见面测试");

    expect(parseCreatePlanForm(formData)).toEqual({
      ok: false,
      error: "请选择计划到达日期",
    });
  });

  it("rejects an arrival date before the Shanghai calendar day", () => {
    const formData = new FormData();
    formData.set("title", "周末跨城见面测试");
    formData.set("arrivalDate", "2026-07-18");
    formData.set("participantLimit", "4");

    expect(parseCreatePlanForm(formData, "2026-07-19")).toEqual({
      ok: false,
      error: "请选择今天或之后的到达日期",
    });
  });

  it("explains when the selected calendar date does not exist", () => {
    const formData = new FormData();
    formData.set("title", "周末跨城见面测试");
    formData.set("arrivalDate", "2026-02-31");
    formData.set("participantLimit", "4");

    expect(parseCreatePlanForm(formData, "2026-01-01")).toEqual({
      ok: false,
      error: "请选择真实存在的到达日期",
    });
  });

  it("allows today as the arrival date", () => {
    const formData = new FormData();
    formData.set("title", "周末跨城见面测试");
    formData.set("arrivalDate", "2026-07-19");
    formData.set("participantLimit", "4");

    expect(parseCreatePlanForm(formData, "2026-07-19")).toMatchObject({
      ok: true,
      data: { arrivalDate: "2026-07-19" },
    });
  });
});
