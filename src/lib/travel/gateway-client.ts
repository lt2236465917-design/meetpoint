import { z } from "zod";

import type { GatewaySearchRequest } from "./types";

const bookingUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  const approvedHosts = ["fliggy.com", "alitrip.com", "feizhu.com"];
  return url.protocol === "https:"
    && approvedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}, "Booking URL must use HTTPS on an approved FlyAI booking host");

const gatewayOptionSchema = z.object({
  mode: z.enum(["flight", "high_speed_rail", "normal_train"]),
  source: z.literal("real"),
  provider: z.literal("flyai"),
  priceCny: z.number().int().nonnegative(),
  departAt: z.iso.datetime({ offset: true }),
  arriveAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().positive(),
  isDirect: z.boolean(),
  hasTransfer: z.boolean(),
  transferCount: z.number().int().nonnegative(),
  serviceName: z.string().trim().min(1).max(64),
  bookingUrl: bookingUrlSchema.nullable(),
}).strict();

const gatewayResponseSchema = z.object({
  options: z.array(gatewayOptionSchema),
  queriedAt: z.iso.datetime({ offset: true }),
}).strict();

export type GatewaySearchResult = z.infer<typeof gatewayResponseSchema>;

export type GatewayClientErrorCode =
  | "GATEWAY_NOT_CONFIGURED"
  | "GATEWAY_TIMEOUT"
  | "GATEWAY_UNAVAILABLE"
  | "GATEWAY_INVALID_RESPONSE";

export class GatewayClientError extends Error {
  constructor(readonly code: GatewayClientErrorCode) {
    super(code);
    this.name = "GatewayClientError";
  }
}

export type SearchGatewayOptions = {
  gatewayUrl?: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function gatewayEndpoint(gatewayUrl: string): string {
  try {
    return new URL("/v1/search", gatewayUrl).toString();
  } catch {
    throw new GatewayClientError("GATEWAY_NOT_CONFIGURED");
  }
}

function gatewayTimeout(timeoutMs: number | undefined): number {
  const configured = timeoutMs ?? Number(process.env.TRAVEL_GATEWAY_TIMEOUT_MS || 30_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 30_000;
}

function isAbort(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && (error.name === "AbortError" || error.name === "TimeoutError");
}

export async function searchGateway(
  input: GatewaySearchRequest,
  options: SearchGatewayOptions = {},
): Promise<GatewaySearchResult> {
  const gatewayUrl = options.gatewayUrl ?? process.env.TRAVEL_GATEWAY_URL;
  const token = options.token ?? process.env.TRAVEL_GATEWAY_TOKEN;
  if (!gatewayUrl || !token) throw new GatewayClientError("GATEWAY_NOT_CONFIGURED");

  const endpoint = gatewayEndpoint(gatewayUrl);
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(gatewayTimeout(options.timeoutMs)),
    });
  } catch (error) {
    throw new GatewayClientError(isAbort(error) ? "GATEWAY_TIMEOUT" : "GATEWAY_UNAVAILABLE");
  }

  if (!response.ok) throw new GatewayClientError("GATEWAY_UNAVAILABLE");

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GatewayClientError("GATEWAY_INVALID_RESPONSE");
  }

  const parsed = gatewayResponseSchema.safeParse(body);
  if (!parsed.success) throw new GatewayClientError("GATEWAY_INVALID_RESPONSE");
  return parsed.data;
}
