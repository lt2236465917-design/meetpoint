import { z } from "zod";

import { generateCandidateCities } from "@/lib/city/candidate-generator";
import { findCityByCode } from "@/data/cities";
import { buildRouteTasks } from "@/lib/recommendation/query-matrix";
import type { RecommendationRepository } from "@/lib/recommendation/repository";
import { transportModeSchema } from "@/lib/validation/schemas";

const participantSchema = z.object({
  id: z.string().trim().min(1),
  departureCityCode: z.string().trim().min(1),
  departureCityName: z.string().trim().min(1),
  acceptedModes: z.array(transportModeSchema).min(1),
}).strict().superRefine((participant, context) => {
  if (!findCityByCode(participant.departureCityCode)) {
    context.addIssue({ code: "custom", path: ["departureCityCode"], message: "unknown city" });
  }
});

const managerInputSchema = z.object({
  planId: z.string().trim().min(1),
  arrivalDate: z.iso.date(),
  participants: z.array(participantSchema).min(2).max(6).superRefine((participants, context) => {
    const seen = new Set<string>();
    for (const [index, participant] of participants.entries()) {
      if (seen.has(participant.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "duplicate participant id",
        });
      }
      seen.add(participant.id);
    }
  }),
  manualAddCityCodes: z.array(z.string()).optional(),
  manualExcludeCityCodes: z.array(z.string()).optional(),
  alternative: z.object({
    cityCode: z.string().trim().min(1),
    cityName: z.string().trim().min(1),
    requestedByParticipantId: z.string().trim().min(1),
  }).strict().optional(),
}).strict();

export type ManagerInput = z.input<typeof managerInputSchema>;

export class ManagerAgent {
  constructor(private readonly repository: RecommendationRepository) {}

  async prepare(input: ManagerInput): Promise<{ runId: string; taskIds: string[] }> {
    const parsed = managerInputSchema.parse(input);
    const requestedCity = parsed.alternative
      ? findCityByCode(parsed.alternative.cityCode)
      : null;
    if (parsed.alternative && (
      !requestedCity
      || requestedCity.name !== parsed.alternative.cityName
      || !parsed.participants.some((participant) => participant.id === parsed.alternative?.requestedByParticipantId)
    )) throw new Error("invalid alternative city request");
    const candidates = requestedCity
      ? [requestedCity]
      : generateCandidateCities({
          departureCityCodes: parsed.participants.map((participant) => participant.departureCityCode),
          manualAddCityCodes: parsed.manualAddCityCodes,
          manualExcludeCityCodes: parsed.manualExcludeCityCodes,
        });
    const tasks = buildRouteTasks({
      participants: parsed.participants,
      candidates,
      arrivalDate: parsed.arrivalDate,
    });
    if (candidates.length === 0 || tasks.length === 0) {
      throw new Error("participants produced no bounded route tasks");
    }
    return this.repository.createRunMatrix({
      planId: parsed.planId,
      arrivalDate: parsed.arrivalDate,
      candidates: candidates.map((candidate) => ({
        cityCode: candidate.code,
        cityName: candidate.name,
        source: "system",
      })),
      tasks,
      kind: parsed.alternative ? "alternative" : "automatic",
      requestedCityCode: parsed.alternative?.cityCode ?? null,
      requestedByParticipantId: parsed.alternative?.requestedByParticipantId ?? null,
    });
  }
}
