import { execFile as nodeExecFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { z } from "zod";

import {
  gatewayTravelOptionSchema,
  type GatewayErrorCode,
  type GatewaySearchRequest,
  type GatewayTravelOption,
} from "./contracts.js";

const EXECUTION_OPTIONS = {
  shell: false,
  timeout: 12_000,
  maxBuffer: 1_000_000,
  encoding: "utf8",
} as const;

const rawRowSchema = z.object({
  category: z.enum(["flight", "train"]),
  price: z.number().int().nonnegative(),
  departureTime: z.iso.datetime({ offset: true }),
  arrivalTime: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().positive(),
  flightNumber: z.string().trim().min(1).max(64).optional(),
  trainNumber: z.string().trim().min(1).max(64).optional(),
  departureStationName: z.string().trim().min(1).max(64).nullable().optional(),
  arrivalStationName: z.string().trim().min(1).max(64).nullable().optional(),
  direct: z.boolean(),
  isDirect: z.boolean().optional(),
  transferCount: z.number().int().nonnegative().optional(),
  hasTransfer: z.boolean().optional(),
  bookingUrl: z.string().nullable(),
}).passthrough().superRefine((row, context) => {
  if ((row.flightNumber === undefined) === (row.trainNumber === undefined)) {
    context.addIssue({ code: "custom", message: "Exactly one service identity is required" });
  }
  if ((row.category === "flight") !== (row.flightNumber !== undefined)) {
    context.addIssue({ code: "custom", message: "Category must match service identity" });
  }
  if (row.isDirect !== undefined && row.isDirect !== row.direct) {
    context.addIssue({ code: "custom", message: "Direct indicators must agree" });
  }

  const expectedHasTransfer = !row.direct;
  if (row.transferCount !== undefined && (row.transferCount > 0) !== expectedHasTransfer) {
    context.addIssue({ code: "custom", message: "Transfer count must agree with direct indicator" });
  }
  if (row.hasTransfer !== undefined && row.hasTransfer !== expectedHasTransfer) {
    context.addIssue({ code: "custom", message: "Transfer indicator must agree with direct indicator" });
  }

  const departure = Date.parse(row.departureTime);
  const arrival = Date.parse(row.arrivalTime);
  const actualDurationMilliseconds = arrival - departure;
  if (actualDurationMilliseconds <= 0) {
    context.addIssue({ code: "custom", message: "Arrival must be later than departure" });
  } else if (actualDurationMilliseconds !== row.durationMinutes * 60_000) {
    context.addIssue({ code: "custom", message: "Duration must match timestamp interval" });
  }
});

const liveSegmentSchema = z.object({
  depDateTime: z.string().trim().min(1),
  arrDateTime: z.string().trim().min(1),
  duration: z.string().trim().min(1),
  marketingTransportNo: z.string().trim().min(1),
  transportType: z.string().trim().min(1),
}).passthrough();

const liveItemSchema = z.object({
  journeys: z.array(z.object({
    segments: z.array(liveSegmentSchema).min(1),
  })).min(1),
  jumpUrl: z.string().nullable().optional(),
  adultPrice: z.string().optional(),
  price: z.string().optional(),
  ticketPrice: z.string().optional(),
  totalDuration: z.string().optional(),
}).passthrough();

const liveResponseSchema = z.object({
  data: z.object({
    itemList: z.array(z.unknown()),
  }),
}).passthrough();

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;
type ExecFile = (
  executable: string,
  args: readonly string[],
  options: typeof EXECUTION_OPTIONS,
  callback: ExecFileCallback,
) => unknown;

export class FlyAIAdapterError extends Error {
  readonly code: GatewayErrorCode;

  constructor(code: GatewayErrorCode, message: string) {
    super(message);
    this.name = "FlyAIAdapterError";
    this.code = code;
  }
}

export type FlyAIDiagnostic = {
  routeFingerprint: string;
  mode: GatewaySearchRequest["mode"];
  outcome: "SUCCESS" | GatewayErrorCode;
  topLevelKeys: string[];
  dataKeys: string[];
  itemKeys: string[];
  itemCount: number;
  normalizedCount: number;
  droppedCount: number;
  droppedReasons: string[];
  cliErrorCode: GatewayErrorCode | null;
};

interface Logger {
  error(message: string): void;
}

export interface FlyAIAdapterDependencies {
  execFile?: ExecFile;
  executable?: string;
  logger?: Logger;
  diagnosticLogger?: (event: FlyAIDiagnostic) => void;
}

function routeFingerprint(input: GatewaySearchRequest): string {
  const routeKey = ["v1", input.originCityCode, input.destinationCityCode, input.departureDate, input.mode].join(":");
  return createHash("sha256").update(routeKey).digest("hex").slice(0, 16);
}

function emitDiagnostic(
  logger: FlyAIAdapterDependencies["diagnosticLogger"],
  event: FlyAIDiagnostic,
): void {
  try {
    logger?.(event);
  } catch {
    // Diagnostics must not affect ticket availability.
  }
}

function objectKeys(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  return Object.keys(value).sort().slice(0, 32);
}

function diagnosticFor(
  input: GatewaySearchRequest,
  outcome: FlyAIDiagnostic["outcome"],
  details: Partial<Omit<FlyAIDiagnostic, "routeFingerprint" | "mode" | "outcome">> = {},
): FlyAIDiagnostic {
  return {
    routeFingerprint: routeFingerprint(input),
    mode: input.mode,
    outcome,
    topLevelKeys: details.topLevelKeys ?? [],
    dataKeys: details.dataKeys ?? [],
    itemKeys: details.itemKeys ?? [],
    itemCount: details.itemCount ?? 0,
    normalizedCount: details.normalizedCount ?? 0,
    droppedCount: details.droppedCount ?? 0,
    droppedReasons: details.droppedReasons ?? [],
    cliErrorCode: details.cliErrorCode ?? null,
  };
}

function packageLocalExecutable(): string {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve("@fly-ai/flyai-cli/package.json");
  return path.join(path.dirname(packageJson), "dist", "flyai-bundle.cjs");
}

function buildArgs(input: GatewaySearchRequest): string[] {
  const command = input.mode === "flight" ? "search-flight" : "search-train";
  return [
    command,
    "--origin",
    input.originCityName,
    "--destination",
    input.destinationCityName,
    "--dep-date",
    input.departureDate,
    "--sort-type",
    "3",
  ];
}

function isTimeout(error: Error): boolean {
  const details = error as Error & { code?: string; killed?: boolean; signal?: string };
  return details.code === "ETIMEDOUT" || (details.killed === true && details.signal === "SIGTERM");
}

function classifyProviderText(text: string): GatewayErrorCode | null {
  const normalized = text.toLowerCase();

  if (/(no\s*(route|itinerary|flight|train)|route\s*(not\s*found|unavailable)|无航线|无车次|无线路|没有.*(航班|车次|线路))/.test(normalized)) {
    return "PROVIDER_NO_ROUTE";
  }
  if (/(no\s*(ticket|seat|availability)|sold\s*out|暂无|无票|售罄|余票不足|不可售)/.test(normalized)) {
    return "PROVIDER_NO_TICKET";
  }
  if (/(rate\s*limit|too\s*many\s*requests|\b429\b|\b403\b|risk\s*control|abnormal\s*access|限流|频率|请求过多|风控|访问异常)/.test(normalized)) {
    return "PROVIDER_RATE_LIMITED";
  }
  if (/(upstream|service\s*unavailable|bad\s*gateway|gateway\s*timeout|\b5\d{2}\b|供应商|上游|服务不可用)/.test(normalized)) {
    return "PROVIDER_UPSTREAM_UNAVAILABLE";
  }
  return null;
}

function classifyCliError(error: Error, stdout: string, stderr: string): GatewayErrorCode {
  if (isTimeout(error)) return "PROVIDER_TIMEOUT";
  const details = error as Error & { code?: string };
  const classified = classifyProviderText(`${stderr}\n${stdout}\n${error.message}`);
  if (classified !== null) return classified;
  if (details.code === "ENOENT" || details.code === "EACCES" || details.code === "ECLI") {
    return "PROVIDER_CLI_FAILED";
  }
  return "PROVIDER_UNAVAILABLE";
}

function execute(execFile: ExecFile, executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, EXECUTION_OPTIONS, (error, stdout, stderr) => {
      if (error !== null) {
        const code = classifyCliError(error, stdout, stderr);
        reject(new FlyAIAdapterError(
          code,
          code === "PROVIDER_TIMEOUT" ? "FlyAI request timed out" : "FlyAI CLI request failed",
        ));
        return;
      }
      resolve(stdout);
    });
  });
}

function parseDurationMinutes(value: string): number | null {
  const hourMinute = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (hourMinute) {
    return Number(hourMinute[1]) * 60 + Number(hourMinute[2]);
  }
  const hours = /(\d+(?:\.\d+)?)\s*(?:h|hour|小时)/i.exec(value);
  const minutes = /(\d+)\s*(?:m|min|分钟|分)/i.exec(value);
  if (hours || minutes) {
    return Math.round(Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0));
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
}

function firstPriceCny(...values: Array<string | undefined>): number | null {
  for (const value of values) {
    if (value === undefined) continue;
    const normalized = value.trim()
      .replace(/^(?:¥|￥|cny|rmb)\s*/i, "")
      .replaceAll(",", "");
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) continue;
    const price = Number(normalized);
    if (Number.isFinite(price) && price >= 0) return Math.round(price);
  }
  return null;
}

function withChinaOffset(value: string): string {
  if (/([+-]\d{2}:?\d{2}|Z)$/i.test(value)) {
    return value;
  }
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return `${normalized}+08:00`;
}

function firstStringValue(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeLiveItem(
  item: z.infer<typeof liveItemSchema>,
  mode: GatewaySearchRequest["mode"],
): z.infer<typeof rawRowSchema> | null {
  const segment = item.journeys[0]?.segments[0];
  if (!segment) return null;
  const firstJourney = item.journeys[0]!;
  const price = mode === "flight"
    ? firstPriceCny(item.ticketPrice, item.adultPrice)
    : firstPriceCny(item.price, item.adultPrice);
  const durationMinutes = parseDurationMinutes(segment.duration) ?? parseDurationMinutes(item.totalDuration ?? "");
  if (price === null || durationMinutes === null) return null;
  const category = mode === "flight" ? "flight" : "train";
  return {
    category,
    price: Math.round(price),
    departureTime: withChinaOffset(segment.depDateTime),
    arrivalTime: withChinaOffset(segment.arrDateTime),
    durationMinutes,
    flightNumber: category === "flight" ? segment.marketingTransportNo : undefined,
    trainNumber: category === "train" ? segment.marketingTransportNo : undefined,
    departureStationName: firstStringValue(segment, [
      "depStationName",
      "departureStationName",
      "departureStation",
      "depAirportName",
      "departureAirportName",
      "fromStationName",
      "fromAirportName",
    ]),
    arrivalStationName: firstStringValue(segment, [
      "arrStationName",
      "arrivalStationName",
      "arrivalStation",
      "arrAirportName",
      "arrivalAirportName",
      "toStationName",
      "toAirportName",
    ]),
    direct: item.journeys.length === 1 && firstJourney.segments.length === 1,
    bookingUrl: item.jumpUrl ?? null,
  };
}

type EvidenceFields = {
  providerQuoteId: string | null;
  serviceName: string;
  departAt: string;
  arriveAt: string;
  priceCny: number;
  transferCount: number;
};

function evidenceId(input: GatewaySearchRequest, option: EvidenceFields): string {
  const canonical = JSON.stringify([
    "flyai",
    option.providerQuoteId,
    input.mode,
    input.originCityCode,
    input.destinationCityCode,
    input.departureDate,
    option.serviceName,
    option.departAt,
    option.arriveAt,
    option.priceCny,
    option.transferCount,
  ]);
  return `flyai:${createHash("sha256").update(canonical).digest("hex")}`;
}

function normalizeRow(
  row: z.infer<typeof rawRowSchema>,
  input: GatewaySearchRequest,
  providerQuoteId: string | null,
): GatewayTravelOption | null {
  const mode = input.mode;
  const serviceName = row.flightNumber ?? row.trainNumber!;
  const classifiedMode = row.flightNumber === undefined && /^[GCD]/i.test(serviceName)
    ? "high_speed_rail"
    : row.flightNumber === undefined
      ? "normal_train"
      : "flight";

  if (classifiedMode !== mode) {
    return null;
  }

  const transferCount = row.direct ? 0 : (row.transferCount ?? 1);
  const evidence = {
    providerQuoteId,
    serviceName,
    departAt: row.departureTime,
    arriveAt: row.arrivalTime,
    priceCny: row.price,
    transferCount,
  };
  return gatewayTravelOptionSchema.parse({
    quoteId: evidenceId(input, evidence),
    providerQuoteId,
    mode: classifiedMode,
    source: "real",
    provider: "flyai",
    priceCny: row.price,
    departAt: row.departureTime,
    arriveAt: row.arrivalTime,
    durationMinutes: row.durationMinutes,
    isDirect: row.direct,
    hasTransfer: transferCount > 0,
    transferCount,
    serviceName,
    departureStationName: row.departureStationName ?? null,
    arrivalStationName: row.arrivalStationName ?? null,
    bookingUrl: row.bookingUrl,
  });
}

export async function searchFlyAI(
  input: GatewaySearchRequest,
  dependencies: FlyAIAdapterDependencies = {},
): Promise<GatewayTravelOption[]> {
  const executable = dependencies.executable ?? packageLocalExecutable();
  const execFile = dependencies.execFile ?? nodeExecFile;
  let stdout: string;
  try {
    stdout = await execute(execFile, executable, buildArgs(input));
  } catch (error) {
    const code = error instanceof FlyAIAdapterError ? error.code : "PROVIDER_UNAVAILABLE";
    emitDiagnostic(dependencies.diagnosticLogger, diagnosticFor(input, code, { cliErrorCode: code }));
    throw error;
  }

  try {
    const parsed: unknown = JSON.parse(stdout);
    const topLevelKeys = objectKeys(parsed);
    const legacy = z.array(rawRowSchema).safeParse(parsed);
    if (legacy.success) {
      const result = legacy.data
        .map((row) => normalizeRow(row, input, firstStringValue(row, ["itemId", "quoteId", "id"])))
        .filter((row): row is GatewayTravelOption => row !== null);
      emitDiagnostic(dependencies.diagnosticLogger, diagnosticFor(input, "SUCCESS", { topLevelKeys }));
      return result;
    }

    const live = liveResponseSchema.safeParse(parsed);
    if (live.success) {
      const items = live.data.data.itemList;
      const itemKeys = [...new Set(items.flatMap((item) => objectKeys(item)))].sort().slice(0, 32);
      const droppedReasons = new Set<string>();
      const result: GatewayTravelOption[] = [];

      for (const item of items) {
        const liveItem = liveItemSchema.safeParse(item);
        if (!liveItem.success) {
          droppedReasons.add("invalid_item_shape");
          continue;
        }
        const normalized = normalizeLiveItem(liveItem.data, input.mode);
        const rawRow = normalized === null ? null : rawRowSchema.safeParse(normalized);
        if (rawRow === null || !rawRow.success) {
          droppedReasons.add("missing_required_route_fact");
          continue;
        }
        try {
          const providerQuoteId = firstStringValue(liveItem.data, ["itemId", "quoteId", "id"]);
          const option = normalizeRow(rawRow.data, input, providerQuoteId);
          if (option === null) {
            droppedReasons.add("missing_required_route_fact");
          } else {
            result.push(option);
          }
        } catch {
          droppedReasons.add("missing_required_route_fact");
        }
      }

      const details = {
        topLevelKeys,
        dataKeys: objectKeys(live.data.data),
        itemKeys,
        itemCount: items.length,
        normalizedCount: result.length,
        droppedCount: items.length - result.length,
        droppedReasons: [...droppedReasons].sort(),
      };
      if (items.length > 0 && result.length === 0) {
        emitDiagnostic(dependencies.diagnosticLogger, diagnosticFor(input, "PROVIDER_INVALID_RESPONSE", details));
        throw new FlyAIAdapterError("PROVIDER_INVALID_RESPONSE", "FlyAI returned an invalid response");
      }
      emitDiagnostic(dependencies.diagnosticLogger, diagnosticFor(input, "SUCCESS", details));
      return result;
    }

    const envelope = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const providerText = ["code", "message", "status"]
      .map((key) => envelope[key])
      .filter((value): value is string => typeof value === "string")
      .join("\n");
    const code = classifyProviderText(providerText) ?? "PROVIDER_INVALID_RESPONSE";
    emitDiagnostic(dependencies.diagnosticLogger, diagnosticFor(input, code, { topLevelKeys }));
    throw new FlyAIAdapterError(code, "FlyAI returned an invalid response");
  } catch (error) {
    if (error instanceof FlyAIAdapterError) {
      throw error;
    }
    dependencies.logger?.error("FlyAI response normalization failed");
    emitDiagnostic(dependencies.diagnosticLogger, diagnosticFor(input, "PROVIDER_INVALID_RESPONSE"));
    throw new FlyAIAdapterError(
      "PROVIDER_INVALID_RESPONSE",
      "FlyAI returned an invalid response",
    );
  }
}
