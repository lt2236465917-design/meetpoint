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

function parseRows(stdout: string): z.infer<typeof rawRowSchema>[] {
  try {
    const parsed: unknown = JSON.parse(stdout);
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
    return parseRows(stdout)
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
