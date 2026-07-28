import { describe, expect, it } from "vitest";

import { staleAfterForStatus } from "@/lib/recommendation/run-deadlines";

const now = new Date("2026-08-01T00:00:00.000Z");

describe("recommendation run deadlines", () => {
  it("uses 2 hours for active processing and 7 days for host confirmation", () => {
    expect(staleAfterForStatus("collecting", now)).toBe("2026-08-01T02:00:00.000Z");
    expect(staleAfterForStatus("awaiting_host_confirmation", now))
      .toBe("2026-08-08T00:00:00.000Z");
  });

  it.each(["completed", "incomplete", "failed"] as const)(
    "clears the deadline for %s",
    (status) => expect(staleAfterForStatus(status, now)).toBeNull(),
  );
});
