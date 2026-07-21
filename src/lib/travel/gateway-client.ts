import { z } from "zod";

import type { GatewaySearchRequest } from "./types";

const MAX_SERVICE_IDENTITY_SEGMENT_COUNT = 8;
const MAX_SERVICE_IDENTITY_LENGTH = 64;
const SERVICE_NAME_SEPARATOR = " → ";
const MAX_ITINERARY_SERVICE_NAME_LENGTH =
  MAX_SERVICE_IDENTITY_SEGMENT_COUNT * MAX_SERVICE_IDENTITY_LENGTH
  + (MAX_SERVICE_IDENTITY_SEGMENT_COUNT - 1) * SERVICE_NAME_SEPARATOR.length;

const bookingUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  const approvedHosts = ["fliggy.com", "alitrip.com", "feizhu.com"];
  return url.protocol === "https:"
    && approvedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}, "Booking URL must use HTTPS on an approved FlyAI booking host");

const gatewayOptionSchema = z.object({
  quoteId: z.string().regex(/^flyai:[a-f0-9]{64}$/),
  providerQuoteId: z.string().trim().min(1).max(256).nullable(),
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
  serviceName: z.string().trim().min(1).max(MAX_ITINERARY_SERVICE_NAME_LENGTH),
  departureStationName: z.string().trim().min(1).max(64).nullable(),
  arrivalStationName: z.string().trim().min(1).max(64).nullable(),
  bookingUrl: bookingUrlSchema.nullable(),
}).strict().superRefine((option, context) => {
  const segments = option.serviceName.split(SERVICE_NAME_SEPARATOR);
  const hasInvalidSegment = segments.length > MAX_SERVICE_IDENTITY_SEGMENT_COUNT
    || segments.some((segment) => segment.length === 0
      || segment.length > MAX_SERVICE_IDENTITY_LENGTH
      || segment !== segment.trim()
      || segment.includes("→"));
  if (hasInvalidSegment) {
    context.addIssue({
      code: "custom",
      path: ["serviceName"],
      message: "Service name must use one to eight canonical service identity segments",
    });
  }

  const expectedTransferCount = segments.length - 1;
  const expectedIsDirect = expectedTransferCount === 0;
  if (option.transferCount !== expectedTransferCount
    || option.isDirect !== expectedIsDirect
    || option.hasTransfer === expectedIsDirect) {
    context.addIssue({
      code: "custom",
      message: "Transfer metadata must match the service identity segment count",
    });
  }
});

const gatewayResponseSchema = z.object({
  options: z.array(gatewayOptionSchema),
  queriedAt: z.iso.datetime({ offset: true }),
  traceId: z.uuid(),
  cache: z.enum(["hit", "miss"]),
}).strict();

export type GatewaySearchResult = z.infer<typeof gatewayResponseSchema>;

export type GatewayClientErrorCode =
  | "GATEWAY_NOT_CONFIGURED"
  | "GATEWAY_TIMEOUT"
  | "GATEWAY_UNAVAILABLE"
  | "GATEWAY_INVALID_RESPONSE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_NO_ROUTE"
  | "PROVIDER_NO_TICKET"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UPSTREAM_UNAVAILABLE"
  | "PROVIDER_CLI_FAILED"
  | "PROVIDER_INVALID_RESPONSE"
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "INTERNAL_ERROR";

export class GatewayClientError extends Error {
  constructor(
    readonly code: GatewayClientErrorCode,
    readonly traceId: string | null = null,
    readonly retryAfterMs: number | null = null,
  ) {
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

const gatewayErrorBodySchema = z.object({
  code: z.enum([
    "PROVIDER_TIMEOUT",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_NO_ROUTE",
    "PROVIDER_NO_TICKET",
    "PROVIDER_RATE_LIMITED",
    "PROVIDER_UPSTREAM_UNAVAILABLE",
    "PROVIDER_CLI_FAILED",
    "PROVIDER_INVALID_RESPONSE",
    "INVALID_REQUEST",
    "UNAUTHORIZED",
    "INTERNAL_ERROR",
  ]),
  message: z.string().trim().min(1).max(200),
  traceId: z.uuid(),
  retryAfterMs: z.number().int().min(0).max(15_000).nullable(),
}).strict();

async function gatewayError(response: Response): Promise<GatewayClientError> {
  try {
    const parsed = gatewayErrorBodySchema.safeParse(await response.json());
    return parsed.success
      ? new GatewayClientError(parsed.data.code, parsed.data.traceId, parsed.data.retryAfterMs)
      : new GatewayClientError("GATEWAY_UNAVAILABLE");
  } catch {
    return new GatewayClientError("GATEWAY_UNAVAILABLE");
  }
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

  if (!response.ok) throw await gatewayError(response);

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
