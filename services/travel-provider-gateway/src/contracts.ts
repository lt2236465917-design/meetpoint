import { z } from "zod";

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
  meetingDate: calendarDateSchema,
  mode: z.enum(["flight", "high_speed_rail", "normal_train"]),
}).strict();

export const gatewayTravelOptionSchema = z.object({
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
  serviceName: z.string().trim().min(1).max(64),
  departureStationName: z.string().trim().min(1).max(64).nullable(),
  arrivalStationName: z.string().trim().min(1).max(64).nullable(),
  bookingUrl: bookingUrlSchema.nullable(),
}).strict();

export const gatewaySearchResponseSchema = z.object({
  options: z.array(gatewayTravelOptionSchema),
  queriedAt: offsetIsoTimestampSchema,
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
}).strict();

export type GatewayErrorBody = z.infer<typeof gatewayErrorBodySchema>;

export type GatewaySearchRequest = z.infer<typeof gatewaySearchRequestSchema>;
export type GatewayTravelOption = z.infer<typeof gatewayTravelOptionSchema>;
export type GatewaySearchResponse = z.infer<typeof gatewaySearchResponseSchema>;
