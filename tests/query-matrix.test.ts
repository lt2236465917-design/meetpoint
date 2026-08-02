import { describe, expect, it } from "vitest";

import { arrivalDateInShanghai } from "@/lib/recommendation/date";
import { buildRouteTasks, searchDates } from "@/lib/recommendation/query-matrix";

describe("arrival-date route matrix", () => {
  it("expands modes far enough back to cover overnight arrivals", () => {
    expect(searchDates("2026-08-15", "flight")).toEqual(["2026-08-14", "2026-08-15"]);
    expect(searchDates("2026-08-15", "high_speed_rail")).toEqual(["2026-08-14", "2026-08-15"]);
    expect(searchDates("2026-08-15", "normal_train")).toEqual([
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
  });

  it("uses the Shanghai calendar date", () => {
    expect(arrivalDateInShanghai("2026-08-14T17:30:00Z")).toBe("2026-08-15");
    expect(arrivalDateInShanghai("not-an-instant")).toBeNull();
  });

  it("keeps participant-level tasks while sharing a physical lookup key", () => {
    const tasks = buildRouteTasks({
      participants: [
        { id: "p2", departureCityCode: "beijing", departureCityName: "北京", acceptedModes: ["flight"] },
        { id: "p1", departureCityCode: "beijing", departureCityName: "北京", acceptedModes: ["flight"] },
      ],
      candidates: [{ code: "wuhan", name: "武汉" }],
      arrivalDate: "2026-08-15",
    });

    expect(tasks).toHaveLength(4);
    expect(tasks.map((task) => `${task.participantId}:${task.cityCode}:${task.mode}:${task.searchDate}`))
      .toEqual([
        "p1:wuhan:flight:2026-08-14",
        "p2:wuhan:flight:2026-08-14",
        "p1:wuhan:flight:2026-08-15",
        "p2:wuhan:flight:2026-08-15",
      ]);
    expect(tasks[0]?.physicalKey).toBe(tasks[1]?.physicalKey);
    expect(tasks[0]).toEqual(expect.objectContaining({
      originCityName: "北京",
      cityName: "武汉",
    }));
  });

  it("finishes participant coverage for the first candidate before querying the next city", () => {
    const tasks = buildRouteTasks({
      participants: [
        { id: "p2", departureCityCode: "shanghai", acceptedModes: ["flight"] },
        { id: "p1", departureCityCode: "beijing", acceptedModes: ["flight"] },
      ],
      candidates: [{ code: "wuhan" }, { code: "chengdu" }],
      arrivalDate: "2026-08-15",
    });

    expect(tasks.map((task) => task.cityCode)).toEqual([
      "wuhan", "wuhan", "wuhan", "wuhan",
      "chengdu", "chengdu", "chengdu", "chengdu",
    ]);
    expect(tasks.slice(0, 2).map((task) => task.participantId)).toEqual(["p1", "p2"]);
  });

  it("emits no tasks for unsupported modes", () => {
    expect(searchDates("2026-08-15", "bus")).toEqual([]);
    expect(buildRouteTasks({
      participants: [{ id: "p1", departureCityCode: "beijing", acceptedModes: ["bus"] }],
      candidates: [{ code: "wuhan" }],
      arrivalDate: "2026-08-15",
    })).toEqual([]);
  });
});
