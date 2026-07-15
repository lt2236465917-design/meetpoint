import { z } from "zod";

import { transportModeSchema } from "@/lib/validation/schemas";

export const POLICY_VERSION = "2026-07-15.v1" as const;

export const runStatusSchema = z.enum([
  "pending",
  "collecting",
  "cooling_down",
  "calculating",
  "validating",
  "awaiting_host_confirmation",
  "completed",
  "incomplete",
  "failed",
]);

export const routeTaskStatusSchema = z.enum([
  "pending",
  "running",
  "succeeded",
  "empty",
  "retryable_failure",
  "terminal_failure",
]);

export const routeTaskSchema = z
  .object({
    id: z.string(),
    runId: z.string(),
    participantId: z.string(),
    cityCode: z.string(),
    originCityCode: z.string(),
    mode: transportModeSchema,
    searchDate: z.string(),
    physicalKey: z.string(),
    status: routeTaskStatusSchema,
    attemptCount: z.number().int().nonnegative(),
    retryAfter: z.iso.datetime({ offset: true }).nullable(),
    errorCode: z.string().nullable(),
  })
  .strict();

export const verifiedQuoteSchema = z
  .object({
    id: z.string(),
    quoteId: z.string().min(1),
    providerQuoteId: z.string().nullable(),
    participantId: z.string(),
    cityCode: z.string(),
    mode: transportModeSchema,
    searchDate: z.string(),
    queriedAt: z.iso.datetime({ offset: true }),
    priceCny: z.number().int().nonnegative(),
    departAt: z.iso.datetime({ offset: true }),
    arriveAt: z.iso.datetime({ offset: true }),
    durationMinutes: z.number().int().positive(),
    transferCount: z.number().int().nonnegative(),
    isDirect: z.boolean(),
    serviceName: z.string().min(1),
  })
  .strict();

export const queryOutcomeSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("success"),
      quotes: z.array(verifiedQuoteSchema).min(1),
    })
    .strict(),
  z.object({ status: z.literal("empty") }).strict(),
  z
    .object({
      status: z.literal("retryable_failure"),
      code: z.string(),
      retryAfterMs: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      status: z.literal("terminal_failure"),
      code: z.string(),
    })
    .strict(),
]);

export const schemeProposalSchema = z
  .object({
    kind: z.enum(["saving", "fast"]),
    quoteIdsByParticipant: z.record(z.string(), z.string().min(1)),
    totalFareCny: z.number().int().nonnegative(),
  })
  .strict();

export const calculationOutputSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("proposal"),
      cityCode: z.string().min(1),
      schemes: z
        .tuple([schemeProposalSchema, schemeProposalSchema])
        .superRefine((schemes, context) => {
          if (schemes[0].kind !== "saving" || schemes[1].kind !== "fast") {
            context.addIssue({
              code: "custom",
              message: "schemes must be saving then fast",
            });
          }
        }),
      comparisonEvidence: z
        .object({
          eligibleCityCodes: z.array(z.string()),
          orderedCityCodes: z.array(z.string()),
        })
        .strict(),
      explanationZh: z.string().regex(/\p{Script=Han}/u),
    })
    .strict(),
  z
    .object({
      status: z.literal("incomplete"),
      missingTaskIds: z.array(z.string()).min(1),
    })
    .strict(),
]);

export type RunStatus = z.infer<typeof runStatusSchema>;
export type RouteTask = z.infer<typeof routeTaskSchema>;
export type QueryOutcome = z.infer<typeof queryOutcomeSchema>;
export type VerifiedQuote = z.infer<typeof verifiedQuoteSchema>;
export type SchemeProposal = z.infer<typeof schemeProposalSchema>;
export type CalculationOutput = z.infer<typeof calculationOutputSchema>;
export type RecommendationProposal = Extract<
  CalculationOutput,
  { status: "proposal" }
>;
export type ValidationDecision =
  | { ok: true }
  | { ok: false; codes: string[] };

export const CORRECTION_CODES = [
  "ARRIVAL_DATE_MISMATCH",
  "ESTIMATED_QUOTE",
  "EXPLANATION_UNSUPPORTED_FACT",
  "INVALID_CITY_EVIDENCE",
  "INVALID_PROPOSAL",
  "INVALID_SCHEMES",
  "MISSING_COVERAGE",
  "MISSING_PARTICIPANT",
  "POLICY_INPUT_LIMIT_EXCEEDED",
  "POLICY_MISMATCH",
  "TOTAL_FARE_MISMATCH",
  "UNKNOWN_QUOTE_ID",
] as const;

export type CorrectionCode = (typeof CORRECTION_CODES)[number];

const correctionCodeSet = new Set<string>(CORRECTION_CODES);

export function isCorrectionCode(value: unknown): value is CorrectionCode {
  return typeof value === "string" && correctionCodeSet.has(value);
}
