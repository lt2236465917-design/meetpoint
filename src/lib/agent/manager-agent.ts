import { z } from "zod";

import { generateCandidateCities } from "@/lib/city/candidate-generator";
import { findCityByCode } from "@/data/cities";
import { buildRouteTasks } from "@/lib/recommendation/query-matrix";
import type { PreparedRun, RecommendationRepository } from "@/lib/recommendation/repository";
import { transportModeSchema } from "@/lib/validation/schemas";
import { createBaselineRecommendation } from "@/lib/recommendation/baseline";

const participantSchema = z.object({
  id: z.string().trim().min(1),
  departureCityCode: z.string().trim().min(1),
  departureCityName: z.string().trim().min(1),
  departureLat: z.number().finite().min(-90).max(90).optional(),
  departureLng: z.number().finite().min(-180).max(180).optional(),
  acceptedModes: z.array(transportModeSchema).min(1),
}).strict().superRefine((participant, context) => {
  if (!(
    findCityByCode(participant.departureCityCode)
    || /^amap-\d{6}$/.test(participant.departureCityCode)
  )) {
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

  async prepare(input: ManagerInput): Promise<PreparedRun> {
    const parsed = managerInputSchema.parse(input);
    const requestedCity = parsed.alternative
      ? findCityByCode(parsed.alternative.cityCode)
      : null;
    const departureCoordinates = parsed.participants.flatMap((participant) => (
      participant.departureLat !== undefined && participant.departureLng !== undefined
        ? [{ code: participant.departureCityCode, lat: participant.departureLat, lng: participant.departureLng }]
        : []
    ));
    if (!parsed.alternative && departureCoordinates.length !== parsed.participants.length) {
      throw new Error("automatic participants require canonical coordinates");
    }
    if (parsed.alternative && (
      !requestedCity
      || requestedCity.name !== parsed.alternative.cityName
      || !parsed.participants.some((participant) => participant.id === parsed.alternative?.requestedByParticipantId)
    )) throw new Error("invalid alternative city request");
    const candidates = requestedCity
      ? [requestedCity]
      : generateCandidateCities({
          departureCityCodes: parsed.participants.map((participant) => participant.departureCityCode),
          departureCoordinates,
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
    const baseline = requestedCity ? null : createBaselineRecommendation({
      candidates,
      departures: departureCoordinates,
    });
    if (!requestedCity && !baseline) throw new Error("participants produced no baseline recommendation");
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
      baseline,
    });
  }
}
