import { z } from "zod";

export const transportModeSchema = z.enum([
  "flight",
  "high_speed_rail",
  "normal_train",
]);

export const createPlanSchema = z.object({
  title: z.string().trim().min(1).max(60),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetArrivalTime: z.string().regex(/^\d{2}:\d{2}$/),
  participantLimit: z.number().int().min(2).max(6),
});

export const participantInputSchema = z.object({
  name: z.string().trim().min(1).max(20),
  departureCityCode: z.string().trim().min(1).max(24),
  departureCityName: z.string().trim().min(1).max(24),
  acceptedModes: z.array(transportModeSchema).min(1).max(3),
});

export const candidateCityInputSchema = z.object({
  cityCode: z.string().trim().min(1).max(24),
  cityName: z.string().trim().min(1).max(24),
  enabled: z.boolean(),
});
