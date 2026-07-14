import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CreatePlanPage native input controls", () => {
  it("uses native picker inputs and a bounded participant picker", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/create/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("ref={meetingDateInputRef}");
    expect(pageSource).toContain("ref={targetArrivalTimeInputRef}");
    expect(pageSource).toContain('type="date"');
    expect(pageSource).toContain('type="time"');
    expect(pageSource).toContain('className="native-picker-hit-area w-full rounded-lg border px-4 py-3 pr-12 font-normal text-gray-950"');
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
