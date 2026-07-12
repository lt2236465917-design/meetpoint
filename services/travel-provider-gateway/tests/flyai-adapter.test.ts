import { execFile as nodeExecFile } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

import type { GatewaySearchRequest } from "../src/contracts.js";
import { FlyAIAdapterError, searchFlyAI } from "../src/flyai-adapter.js";

type ExecCallback = Parameters<typeof nodeExecFile>[3];

const baseInput: GatewaySearchRequest = {
  originCityCode: "beijing",
  originCityName: "北京",
  destinationCityCode: "shanghai",
  destinationCityName: "上海",
  meetingDate: "2026-08-20",
  mode: "flight",
};

const flightRow = {
  price: 680,
  departureTime: "2026-08-20T08:00:00+08:00",
  arrivalTime: "2026-08-20T10:15:00+08:00",
  durationMinutes: 135,
  flightNumber: "MU5101",
  direct: true,
  bookingUrl: "https://www.fliggy.com/flight/MU5101",
};

function executorReturning(payload: unknown) {
  return vi.fn((_file: string, _args: readonly string[], _options: object, callback: ExecCallback) => {
    callback(null, JSON.stringify(payload), "");
    return undefined as never;
  });
}

describe("searchFlyAI", () => {
  it.each([
    ["flight", "search-flight"],
    ["high_speed_rail", "search-train"],
    ["normal_train", "search-train"],
  ] as const)("builds safe %s CLI arguments", async (mode, command) => {
    const execFile = executorReturning([]);

    await searchFlyAI({ ...baseInput, mode }, { execFile, executable: "/safe/flyai" });

    expect(execFile).toHaveBeenCalledWith(
      "/safe/flyai",
      [command, "--origin", "北京", "--destination", "上海", "--dep-date", "2026-08-20", "--sort-type", "3"],
      { shell: false, timeout: 12_000, maxBuffer: 1_000_000, encoding: "utf8" },
      expect.any(Function),
    );
  });

  it("normalizes complete flight fields without logging raw stdout", async () => {
    const execFile = executorReturning([flightRow]);
    const logger = { error: vi.fn() };

    const result = await searchFlyAI(baseInput, { execFile, executable: "/safe/flyai", logger });

    expect(result).toEqual([{
      mode: "flight",
      source: "real",
      provider: "flyai",
      priceCny: 680,
      departAt: "2026-08-20T08:00:00+08:00",
      arriveAt: "2026-08-20T10:15:00+08:00",
      durationMinutes: 135,
      isDirect: true,
      hasTransfer: false,
      transferCount: 0,
      serviceName: "MU5101",
      bookingUrl: "https://www.fliggy.com/flight/MU5101",
    }]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("classifies G/C/D services as high-speed rail and excludes normal trains", async () => {
    const execFile = executorReturning([
      { ...flightRow, flightNumber: undefined, trainNumber: "G1", bookingUrl: null },
      { ...flightRow, flightNumber: undefined, trainNumber: "C202", bookingUrl: null },
      { ...flightRow, flightNumber: undefined, trainNumber: "D33", bookingUrl: null },
      { ...flightRow, flightNumber: undefined, trainNumber: "Z9", bookingUrl: null },
    ]);

    const result = await searchFlyAI(
      { ...baseInput, mode: "high_speed_rail" },
      { execFile, executable: "/safe/flyai" },
    );

    expect(result.map((row) => row.serviceName)).toEqual(["G1", "C202", "D33"]);
    expect(result.every((row) => row.mode === "high_speed_rail")).toBe(true);
  });

  it("keeps normal trains and excludes G/C/D services", async () => {
    const execFile = executorReturning([
      { ...flightRow, flightNumber: undefined, trainNumber: "G1", bookingUrl: null },
      { ...flightRow, flightNumber: undefined, trainNumber: "K123", bookingUrl: null },
    ]);

    const result = await searchFlyAI(
      { ...baseInput, mode: "normal_train" },
      { execFile, executable: "/safe/flyai" },
    );

    expect(result.map((row) => row.serviceName)).toEqual(["K123"]);
    expect(result[0]?.mode).toBe("normal_train");
  });

  it.each(["price", "departureTime", "arrivalTime", "durationMinutes", "flightNumber"])(
    "rejects rows missing required %s data",
    async (field) => {
      const row = { ...flightRow } as Record<string, unknown>;
      delete row[field];
      const execFile = executorReturning([row]);

      await expect(searchFlyAI(baseInput, { execFile, executable: "/safe/flyai" })).rejects.toMatchObject({
        name: "FlyAIAdapterError",
        code: "PROVIDER_INVALID_RESPONSE",
      });
    },
  );

  it("rejects malformed output instead of salvaging a valid JSON line", async () => {
    const execFile = vi.fn((_file: string, _args: readonly string[], _options: object, callback: ExecCallback) => {
      callback(null, `${JSON.stringify([flightRow])}\nnot-json`, "");
      return undefined as never;
    });

    await expect(searchFlyAI(baseInput, { execFile, executable: "/safe/flyai" })).rejects.toBeInstanceOf(FlyAIAdapterError);
  });

  it("maps CLI timeouts to a typed provider timeout without logging stdout", async () => {
    const timedOut = Object.assign(new Error("command timed out"), { killed: true, signal: "SIGTERM", stdout: "secret raw output" });
    const execFile = vi.fn((_file: string, _args: readonly string[], _options: object, callback: ExecCallback) => {
      callback(timedOut, "secret raw output", "");
      return undefined as never;
    });
    const logger = { error: vi.fn() };

    await expect(searchFlyAI(baseInput, { execFile, executable: "/safe/flyai", logger })).rejects.toMatchObject({
      name: "FlyAIAdapterError",
      code: "PROVIDER_TIMEOUT",
    });
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining("secret raw output"));
  });
});
