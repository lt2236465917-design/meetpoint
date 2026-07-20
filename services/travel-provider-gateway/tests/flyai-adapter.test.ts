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
  departureDate: "2026-08-20",
  mode: "flight",
};

const flightRow = {
  category: "flight",
  price: 680,
  departureTime: "2026-08-20T08:00:00+08:00",
  arrivalTime: "2026-08-20T10:15:00+08:00",
  durationMinutes: 135,
  flightNumber: "MU5101",
  departureStationName: "北京首都",
  arrivalStationName: "上海虹桥",
  direct: true,
  bookingUrl: "https://www.fliggy.com/flight/MU5101",
};

const trainRow = {
  ...flightRow,
  category: "train",
  flightNumber: undefined,
  trainNumber: "G1",
  bookingUrl: null,
};

const liveFlightItem = {
  ticketPrice: "680",
  totalDuration: "02:15:00",
  jumpUrl: "https://a.feizhu.com/flight/MU5101",
  journeys: [{
    segments: [{
      depDateTime: "2026-08-20 08:00:00",
      arrDateTime: "2026-08-20 10:15:00",
      duration: "02:15:00",
      marketingTransportNo: "MU5101",
      transportType: "flight",
      depStationName: "北京首都",
      arrStationName: "上海虹桥",
    }],
  }],
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

    expect(result[0]?.quoteId).toMatch(/^flyai:[a-f0-9]{64}$/);
    expect(result).toEqual([{
      quoteId: result[0]?.quoteId,
      providerQuoteId: null,
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
      departureStationName: "北京首都",
      arrivalStationName: "上海虹桥",
      bookingUrl: "https://www.fliggy.com/flight/MU5101",
    }]);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("normalizes live FlyAI data.itemList responses", async () => {
    const execFile = executorReturning({
      status: "ok",
      message: "ok",
      systemMessage: "",
      data: {
        itemList: [{
          ticketPrice: "680",
          totalDuration: "02:15:00",
          jumpUrl: "https://a.feizhu.com/flight/MU5101",
          journeys: [{
            segments: [{
              depDateTime: "2026-08-20 08:00:00",
              arrDateTime: "2026-08-20 10:15:00",
              duration: "02:15:00",
              marketingTransportNo: "MU5101",
              transportType: "flight",
              depStationName: "北京首都",
              arrStationName: "上海虹桥",
            }],
          }],
        }],
      },
    });

    const result = await searchFlyAI(baseInput, { execFile, executable: "/safe/flyai" });

    expect(result[0]?.quoteId).toMatch(/^flyai:[a-f0-9]{64}$/);
    expect(result).toEqual([{
      quoteId: result[0]?.quoteId,
      providerQuoteId: null,
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
      departureStationName: "北京首都",
      arrivalStationName: "上海虹桥",
      bookingUrl: "https://a.feizhu.com/flight/MU5101",
    }]);
  });

  it.each([
    ["flight", "MU5101", "flight"],
    ["high_speed_rail", "G1", "train"],
  ] as const)("normalizes documented adultPrice currency strings for %s", async (mode, serviceName, transportType) => {
    const execFile = executorReturning({
      data: {
        itemList: [{
          adultPrice: "¥400.0",
          totalDuration: "02:15:00",
          jumpUrl: `https://a.feizhu.com/${transportType}/${serviceName}`,
          journeys: [{
            segments: [{
              ...liveFlightItem.journeys[0].segments[0],
              marketingTransportNo: serviceName,
              transportType,
            }],
          }],
        }],
      },
    });

    const result = await searchFlyAI(
      { ...baseInput, mode },
      { execFile, executable: "/safe/flyai" },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ mode, priceCny: 400, serviceName });
  });

  it("issues stable evidence IDs and retains a provider-native itemId", async () => {
    const nativeItem = { ...liveFlightItem, itemId: "native-item-42" };
    const renamed = {
      ...nativeItem,
      jumpUrl: "https://a.feizhu.com/flight/another-booking-path",
      journeys: [{ segments: [{
        ...nativeItem.journeys[0].segments[0],
        depStationName: "首都机场 T2",
        arrStationName: "虹桥机场 T2",
      }] }],
    };

    const first = await searchFlyAI(baseInput, {
      execFile: executorReturning({ data: { itemList: [nativeItem] } }),
      executable: "/safe/flyai",
    });
    const second = await searchFlyAI(baseInput, {
      execFile: executorReturning({ data: { itemList: [renamed] } }),
      executable: "/safe/flyai",
    });

    expect(first[0]?.quoteId).toMatch(/^flyai:[a-f0-9]{64}$/);
    expect(first[0]?.providerQuoteId).toBe("native-item-42");
    expect(second[0]?.quoteId).toBe(first[0]?.quoteId);
  });

  it("changes the evidence ID when the normalized price or schedule changes", async () => {
    const search = async (item: typeof liveFlightItem) => searchFlyAI(baseInput, {
      execFile: executorReturning({ data: { itemList: [item] } }),
      executable: "/safe/flyai",
    });
    const baseline = await search(liveFlightItem);
    const changedPrice = await search({ ...liveFlightItem, ticketPrice: "681" });
    const changedSchedule = await search({
      ...liveFlightItem,
      journeys: [{ segments: [{
        ...liveFlightItem.journeys[0].segments[0],
        depDateTime: "2026-08-20 09:00:00",
        arrDateTime: "2026-08-20 11:15:00",
      }] }],
    });

    expect(changedPrice[0]?.quoteId).not.toBe(baseline[0]?.quoteId);
    expect(changedSchedule[0]?.quoteId).not.toBe(baseline[0]?.quoteId);
  });

  it("keeps valid live items when a sibling item is malformed", async () => {
    const diagnostics: unknown[] = [];
    const execFile = executorReturning({
      data: {
        itemList: [
          liveFlightItem,
          {
            ...liveFlightItem,
            journeys: [{
              segments: [{
                ...liveFlightItem.journeys[0].segments[0],
                marketingTransportNo: undefined,
              }],
            }],
          },
        ],
      },
    });

    const result = await searchFlyAI(baseInput, {
      execFile,
      executable: "/safe/flyai",
      diagnosticLogger: (event) => diagnostics.push(event),
    });

    expect(result).toHaveLength(1);
    expect(diagnostics).toEqual([expect.objectContaining({
      mode: "flight",
      outcome: "SUCCESS",
      itemCount: 2,
      normalizedCount: 1,
      droppedCount: 1,
      droppedReasons: ["invalid_item_shape"],
      cliErrorCode: null,
    })]);
  });

  it("classifies a live error envelope without leaking its text into diagnostics", async () => {
    const secret = "supplier-detail=do-not-log";
    const diagnostics: unknown[] = [];
    const execFile = executorReturning({ code: "429", message: `Too many requests ${secret}` });

    await expect(searchFlyAI(baseInput, {
      execFile,
      executable: "/safe/flyai",
      diagnosticLogger: (event) => diagnostics.push(event),
    })).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });

    expect(JSON.stringify(diagnostics)).not.toContain(secret);
    expect(diagnostics).toEqual([expect.objectContaining({
      outcome: "PROVIDER_RATE_LIMITED",
      itemCount: 0,
      normalizedCount: 0,
    })]);
  });

  it("classifies G/C/D services as high-speed rail and excludes normal trains", async () => {
    const execFile = executorReturning([
      { ...trainRow, trainNumber: "G1" },
      { ...trainRow, trainNumber: "C202" },
      { ...trainRow, trainNumber: "D33" },
      { ...trainRow, trainNumber: "Z9" },
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
      { ...trainRow, trainNumber: "G1" },
      { ...trainRow, trainNumber: "K123" },
    ]);

    const result = await searchFlyAI(
      { ...baseInput, mode: "normal_train" },
      { execFile, executable: "/safe/flyai" },
    );

    expect(result.map((row) => row.serviceName)).toEqual(["K123"]);
    expect(result[0]?.mode).toBe("normal_train");
  });

  it("rejects train rows without a train identity", async () => {
    const execFile = executorReturning([{ ...trainRow, trainNumber: undefined }]);

    await expect(searchFlyAI(
      { ...baseInput, mode: "high_speed_rail" },
      { execFile, executable: "/safe/flyai" },
    )).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it.each([
    [{ ...flightRow, trainNumber: "G1" }, baseInput],
    [{ ...trainRow, flightNumber: "MU5101" }, { ...baseInput, mode: "high_speed_rail" }],
  ])("rejects rows with conflicting flight and train identities", async (row, input) => {
    const execFile = executorReturning([row]);

    await expect(searchFlyAI(input as GatewaySearchRequest, { execFile, executable: "/safe/flyai" }))
      .rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it.each([
    [{ ...flightRow, category: "train" }, baseInput],
    [{ ...trainRow, category: "flight" }, { ...baseInput, mode: "high_speed_rail" }],
  ])("rejects a supplier category that conflicts with service identity", async (row, input) => {
    const execFile = executorReturning([row]);

    await expect(searchFlyAI(input as GatewaySearchRequest, { execFile, executable: "/safe/flyai" }))
      .rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it.each([
    { direct: true, isDirect: false },
    { direct: true, transferCount: 1 },
    { direct: true, hasTransfer: true },
    { direct: false, transferCount: 0 },
    { direct: false, hasTransfer: false },
    { direct: false, transferCount: 2, hasTransfer: false },
  ])("rejects contradictory direct and transfer fields: %j", async (conflict) => {
    const execFile = executorReturning([{ ...flightRow, ...conflict }]);

    await expect(searchFlyAI(baseInput, { execFile, executable: "/safe/flyai" }))
      .rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it("rejects arrival timestamps that are not later than departure", async () => {
    const execFile = executorReturning([{ ...flightRow, arrivalTime: flightRow.departureTime }]);

    await expect(searchFlyAI(baseInput, { execFile, executable: "/safe/flyai" }))
      .rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it("rejects duration that differs from the offset timestamp interval", async () => {
    const execFile = executorReturning([{ ...flightRow, durationMinutes: 134 }]);

    await expect(searchFlyAI(baseInput, { execFile, executable: "/safe/flyai" }))
      .rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
  });

  it("rejects unsafe booking URLs", async () => {
    const execFile = executorReturning([{ ...flightRow, bookingUrl: "https://evil.example/MU5101" }]);

    await expect(searchFlyAI(baseInput, { execFile, executable: "/safe/flyai" }))
      .rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
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

  it.each([
    ["PROVIDER_NO_ROUTE", "No route found for this city pair"],
    ["PROVIDER_NO_TICKET", "暂无可售票"],
    ["PROVIDER_RATE_LIMITED", "Too many requests, rate limit exceeded"],
    ["PROVIDER_RATE_LIMITED", "MCP HTTP 403: Abnormal access behavior detected by risk control"],
    ["PROVIDER_UPSTREAM_UNAVAILABLE", "upstream service unavailable 503"],
  ] as const)("classifies FlyAI CLI stderr as %s without exposing provider details", async (code, stderr) => {
    const processError = Object.assign(new Error("flyai failed"), { code: "ECLI" });
    const execFile = vi.fn((_file: string, _args: readonly string[], _options: object, callback: ExecCallback) => {
      callback(processError, "", stderr);
      return undefined as never;
    });

    const thrown = await searchFlyAI(baseInput, { execFile, executable: "/safe/flyai" })
      .catch((error: unknown) => error);

    expect(thrown).toMatchObject({
      name: "FlyAIAdapterError",
      code,
      message: "FlyAI CLI request failed",
    });
    expect(String(thrown)).not.toContain(stderr);
    expect(JSON.stringify(thrown)).not.toContain(stderr);
  });

  it("classifies unrecognized FlyAI CLI failures separately from supplier unavailability", async () => {
    const processError = Object.assign(new Error("spawn failed"), { code: "ENOENT" });
    const execFile = vi.fn((_file: string, _args: readonly string[], _options: object, callback: ExecCallback) => {
      callback(processError, "", "");
      return undefined as never;
    });

    await expect(searchFlyAI(baseInput, { execFile, executable: "/safe/flyai" })).rejects.toMatchObject({
      name: "FlyAIAdapterError",
      code: "PROVIDER_CLI_FAILED",
      message: "FlyAI CLI request failed",
    });
  });

  it("does not retain sensitive execFile stdout or stderr in errors, causes, serialization, or logs", async () => {
    const sensitive = "supplier-token=top-secret";
    const processError = Object.assign(new Error(`failed: ${sensitive}`), {
      code: "ECLI",
      stdout: sensitive,
      stderr: sensitive,
    });
    const execFile = vi.fn((_file: string, _args: readonly string[], _options: object, callback: ExecCallback) => {
      callback(processError, sensitive, sensitive);
      return undefined as never;
    });
    const logger = { error: vi.fn() };

    const thrown = await searchFlyAI(baseInput, { execFile, executable: "/safe/flyai", logger })
      .catch((error: unknown) => error);

    expect(thrown).toMatchObject({
      name: "FlyAIAdapterError",
      code: "PROVIDER_CLI_FAILED",
      message: "FlyAI CLI request failed",
    });
    expect((thrown as Error).cause).toBeUndefined();
    expect(String(thrown)).not.toContain(sensitive);
    expect(JSON.stringify(thrown)).not.toContain(sensitive);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
