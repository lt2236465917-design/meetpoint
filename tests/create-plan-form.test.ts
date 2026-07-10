import { describe, expect, it } from "vitest";
import { parseCreatePlanForm } from "@/lib/ui/create-plan-form";

describe("parseCreatePlanForm", () => {
  it("uses current submitted form values for native date and time inputs", () => {
    const formData = new FormData();
    formData.set("title", "周末跨城见面测试");
    formData.set("meetingDate", "2026-08-15");
    formData.set("targetArrivalTime", "18:30");
    formData.set("participantLimit", "4");

    expect(parseCreatePlanForm(formData)).toEqual({
      ok: true,
      data: {
        title: "周末跨城见面测试",
        meetingDate: "2026-08-15",
        targetArrivalTime: "18:30",
        participantLimit: 4,
      },
    });
  });

  it("returns the first actionable validation message", () => {
    const formData = new FormData();
    formData.set("title", "周末跨城见面测试");

    expect(parseCreatePlanForm(formData)).toEqual({
      ok: false,
      error: "请选择见面日期",
    });
  });
});
