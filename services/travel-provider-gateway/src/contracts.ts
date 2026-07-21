import { z } from "zod";

export const MAX_FLYAI_SEGMENT_COUNT = 8;
export const MAX_FLYAI_SERVICE_IDENTITY_LENGTH = 64;
const SERVICE_NAME_SEPARATOR = " → ";
export const MAX_ITINERARY_SERVICE_NAME_LENGTH =
  MAX_FLYAI_SEGMENT_COUNT * MAX_FLYAI_SERVICE_IDENTITY_LENGTH
  + (MAX_FLYAI_SEGMENT_COUNT - 1) * SERVICE_NAME_SEPARATOR.length;

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month! - 1
    && date.getUTCDate() === day;
}, "Date must be a valid calendar date");

const offsetIsoTimestampSchema = z.iso.datetime({ offset: true });

const bookingUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  const approvedHosts = ["fliggy.com", "alitrip.com", "feizhu.com"];
  return url.protocol === "https:"
    && approvedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}, "Booking URL must use HTTPS on an approved FlyAI booking host");

export const gatewaySearchRequestSchema = z.object({
  originCityCode: z.string().regex(/^[a-z0-9-]{1,24}$/),
  originCityName: z.string().trim().min(1).max(24),
  destinationCityCode: z.string().regex(/^[a-z0-9-]{1,24}$/),
  destinationCityName: z.string().trim().min(1).max(24),
  departureDate: calendarDateSchema,
  mode: z.enum(["flight", "high_speed_rail", "normal_train"]),
}).strict();

export const gatewayTravelOptionSchema = z.object({
  quoteId: z.string().regex(/^flyai:[a-f0-9]{64}$/),
  providerQuoteId: z.string().trim().min(1).max(256).nullable(),
  mode: z.enum(["flight", "high_speed_rail", "normal_train"]),
  source: z.literal("real"),
  provider: z.literal("flyai"),
  priceCny: z.number().int().nonnegative(),
  departAt: offsetIsoTimestampSchema,
  arriveAt: offsetIsoTimestampSchema,
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
  const hasInvalidSegment = segments.length > MAX_FLYAI_SEGMENT_COUNT
    || segments.some((segment) => segment.length === 0
      || segment.length > MAX_FLYAI_SERVICE_IDENTITY_LENGTH
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

export const gatewaySearchResultSchema = z.object({
  options: z.array(gatewayTravelOptionSchema),
  queriedAt: offsetIsoTimestampSchema,
  cache: z.enum(["hit", "miss"]),
}).strict();

export const gatewaySearchResponseSchema = gatewaySearchResultSchema.extend({
  traceId: z.uuid(),
}).strict();

export const gatewayErrorCodeSchema = z.enum([
  "UNAUTHORIZED",
  "INVALID_REQUEST",
  "PROVIDER_TIMEOUT",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_NO_ROUTE",
  "PROVIDER_NO_TICKET",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UPSTREAM_UNAVAILABLE",
  "PROVIDER_CLI_FAILED",
  "PROVIDER_INVALID_RESPONSE",
  "INTERNAL_ERROR",
]);

export type GatewayErrorCode = z.infer<typeof gatewayErrorCodeSchema>;

export const gatewayErrorBodySchema = z.object({
  code: gatewayErrorCodeSchema,
  message: z.string().trim().min(1).max(200),
  traceId: z.uuid(),
  retryAfterMs: z.number().int().min(0).max(15_000).nullable(),
}).strict().superRefine((body, context) => {
  if (body.retryAfterMs !== null && body.code !== "PROVIDER_RATE_LIMITED") {
    context.addIssue({ code: "custom", message: "Retry metadata requires a rate-limit cooldown" });
  }
});

export type GatewayErrorBody = z.infer<typeof gatewayErrorBodySchema>;

export type GatewaySearchRequest = z.infer<typeof gatewaySearchRequestSchema>;
export type GatewayTravelOption = z.infer<typeof gatewayTravelOptionSchema>;
export type GatewaySearchResult = z.infer<typeof gatewaySearchResultSchema>;
export type GatewaySearchResponse = z.infer<typeof gatewaySearchResponseSchema>;
