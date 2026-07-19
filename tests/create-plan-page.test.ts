import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CreatePlanPage native input controls", () => {
  it("uses native picker inputs and a bounded participant picker", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/create/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("ref={arrivalDateInputRef}");
    expect(pageSource).toContain('type="date"');
    expect(pageSource).toContain("min={minimumArrivalDate || undefined}");
    expect(pageSource).not.toContain('type="time"');
    expect(pageSource).not.toContain("targetArrivalTime");
    expect(pageSource).not.toContain("ClockIcon");
    expect(pageSource).not.toContain("目标到达时间");
    expect(pageSource).toContain("计划到达日期");
    expect(pageSource).not.toContain("grid-cols-2");
    expect(pageSource).toContain("native-picker-hit-area");
    expect(pageSource).toContain("atmosphere-field");
    expect(pageSource).not.toContain("openNativePicker");
    expect(pageSource).toContain("participantLimitOpen");
    expect(pageSource).toContain('role="listbox"');
    expect(pageSource).toContain('role="option"');
    expect(pageSource).toContain('name="participantLimit"');
    expect(pageSource).toContain('type="hidden"');
    expect(pageSource).toContain("setParticipantLimitOpen(false);");
    expect(pageSource).toContain('name="participantLimit"');
    expect(pageSource).not.toContain("<select");
    expect(pageSource).not.toContain('type="number"');
    expect(pageSource).toContain(
      "建好后把链接发到群里，人到齐就能开始见面。",
    );
    expect(pageSource).not.toContain("开算");
    expect(pageSource).not.toContain("bottom-full");
    expect(pageSource).not.toContain("absolute bottom-full");
    expect(pageSource).toContain(
      "atmosphere-panel mt-2 w-full overflow-hidden rounded-lg p-1",
    );
    expect(pageSource).toContain("Escape");
    expect(pageSource).toContain("mousedown");
  });

  it("expands the browser's own picker indicator across the input", () => {
    const styles = readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(styles).toContain(
      ".native-picker-hit-area::-webkit-calendar-picker-indicator",
    );
    expect(styles).toContain("inset: 0;");
    expect(styles).toContain("width: 100%;");
    expect(styles).toContain("height: 100%;");
    expect(styles).toContain("opacity: 0;");
  });
});
