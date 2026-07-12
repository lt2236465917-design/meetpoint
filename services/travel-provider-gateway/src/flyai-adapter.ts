import { execFile as nodeExecFile } from "node:child_process";
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
});

const liveItemSchema = z.object({
  journeys: z.array(z.object({
    segments: z.array(liveSegmentSchema).min(1),
  })).min(1),
  jumpUrl: z.string().nullable().optional(),
  price: z.string().optional(),
  ticketPrice: z.string().optional(),
  totalDuration: z.string().optional(),
}).passthrough();

const liveResponseSchema = z.object({
  data: z.object({
    itemList: z.array(liveItemSchema),
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

interface Logger {
  error(message: string): void;
}

export interface FlyAIAdapterDependencies {
  execFile?: ExecFile;
  executable?: string;
  logger?: Logger;
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
    input.meetingDate,
    "--sort-type",
    "3",
  ];
}

function isTimeout(error: Error): boolean {
  const details = error as Error & { code?: string; killed?: boolean; signal?: string };
  return details.code === "ETIMEDOUT" || (details.killed === true && details.signal === "SIGTERM");
}

function execute(execFile: ExecFile, executable: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, EXECUTION_OPTIONS, (error, stdout) => {
      if (error !== null) {
        reject(new FlyAIAdapterError(
          isTimeout(error) ? "PROVIDER_TIMEOUT" : "PROVIDER_UNAVAILABLE",
          isTimeout(error) ? "FlyAI request timed out" : "FlyAI CLI request failed",
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

function withChinaOffset(value: string): string {
  if (/([+-]\d{2}:?\d{2}|Z)$/i.test(value)) {
    return value;
  }
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return `${normalized}+08:00`;
}

function normalizeLiveItem(
  item: z.infer<typeof liveItemSchema>,
  mode: GatewaySearchRequest["mode"],
): z.infer<typeof rawRowSchema> | null {
  const segment = item.journeys[0]?.segments[0];
  if (!segment) return null;
  const firstJourney = item.journeys[0]!;
  const price = Number(mode === "flight" ? item.ticketPrice : item.price);
  const durationMinutes = parseDurationMinutes(segment.duration) ?? parseDurationMinutes(item.totalDuration ?? "");
  if (!Number.isFinite(price) || price < 0 || durationMinutes === null) return null;
  const category = mode === "flight" ? "flight" : "train";
  return {
    category,
    price: Math.round(price),
    departureTime: withChinaOffset(segment.depDateTime),
    arrivalTime: withChinaOffset(segment.arrDateTime),
    durationMinutes,
    flightNumber: category === "flight" ? segment.marketingTransportNo : undefined,
    trainNumber: category === "train" ? segment.marketingTransportNo : undefined,
    direct: item.journeys.length === 1 && firstJourney.segments.length === 1,
    bookingUrl: item.jumpUrl ?? null,
  };
}

function parseRows(stdout: string, mode: GatewaySearchRequest["mode"]): z.infer<typeof rawRowSchema>[] {
  try {
    const parsed: unknown = JSON.parse(stdout);
    const legacy = z.array(rawRowSchema).safeParse(parsed);
    if (legacy.success) return legacy.data;
    const live = liveResponseSchema.safeParse(parsed);
    if (live.success) {
      return live.data.data.itemList
        .map((item) => normalizeLiveItem(item, mode))
        .filter((row): row is z.infer<typeof rawRowSchema> => row !== null);
    }
    return z.array(rawRowSchema).parse(parsed);
  } catch {
    throw new FlyAIAdapterError(
      "PROVIDER_INVALID_RESPONSE",
      "FlyAI returned an invalid response",
    );
  }
}

function normalizeRow(
  row: z.infer<typeof rawRowSchema>,
  mode: GatewaySearchRequest["mode"],
): GatewayTravelOption | null {
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
  return gatewayTravelOptionSchema.parse({
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
    bookingUrl: row.bookingUrl,
  });
}

export async function searchFlyAI(
  input: GatewaySearchRequest,
  dependencies: FlyAIAdapterDependencies = {},
): Promise<GatewayTravelOption[]> {
  const executable = dependencies.executable ?? packageLocalExecutable();
  const execFile = dependencies.execFile ?? nodeExecFile;
  const stdout = await execute(execFile, executable, buildArgs(input));

  try {
    return parseRows(stdout, input.mode)
      .map((row) => normalizeRow(row, input.mode))
      .filter((row): row is GatewayTravelOption => row !== null);
  } catch (error) {
    if (error instanceof FlyAIAdapterError) {
      throw error;
    }
    dependencies.logger?.error("FlyAI response normalization failed");
    throw new FlyAIAdapterError(
      "PROVIDER_INVALID_RESPONSE",
      "FlyAI returned an invalid response",
    );
  }
}
