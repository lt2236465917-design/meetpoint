import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CreatePlanPage native input controls", () => {
  it("uses native picker regions and a bounded participant select", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/create/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("ref={meetingDateInputRef}");
    expect(pageSource).toContain("ref={targetArrivalTimeInputRef}");
    expect(pageSource).toContain("input.showPicker();");
    expect(pageSource).toContain("<select");
    expect(pageSource).toContain('name="participantLimit"');
    expect(pageSource).toContain("<option value={4}>4</option>");
    expect(pageSource).not.toContain('type="number"');
  });

  it("skips the label picker handler for direct native input clicks", () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), "src/app/create/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("event.target === input");
    expect(pageSource).toContain(
      "openNativePicker(event, meetingDateInputRef.current)",
    );
    expect(pageSource).toContain(
      "openNativePicker(event, targetArrivalTimeInputRef.current)",
    );
  });
});
