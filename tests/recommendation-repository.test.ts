import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabaseClient: () => ({ from: mocks.from }),
}));

import { SupabaseRecommendationRepository } from "@/lib/recommendation/repository";

describe("SupabaseRecommendationRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "task-1",
        run_id: "run-1",
        participant_id: "p1",
        city_code: "wuhan",
        origin_city_code: "beijing",
        mode: "flight",
        search_date: "2026-08-14",
        physical_key: "beijing:wuhan:flight:2026-08-14",
        status: "pending",
        attempt_count: 0,
        retry_after: null,
        error_code: null,
        recommendation_runs: [{ plans: [{ meeting_date: "2026-08-15" }] }],
      },
      error: null,
    });
  });

  it("selects the persisted meeting_date and maps it to task arrivalDate", async () => {
    const task = await new SupabaseRecommendationRepository().getRouteTask("task-1");

    expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("plans!inner(meeting_date)"));
    expect(mocks.select).not.toHaveBeenCalledWith(expect.stringContaining("arrival_date"));
    expect(task).toEqual(expect.objectContaining({ arrivalDate: "2026-08-15" }));
  });
});
