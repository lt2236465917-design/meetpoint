export type TransportMode = "flight" | "high_speed_rail" | "normal_train";

export type RecommendationRunStatus =
  | "pending"
  | "collecting"
  | "cooling_down"
  | "calculating"
  | "validating"
  | "awaiting_host_confirmation"
  | "completed"
  | "incomplete"
  | "failed";

export type RecommendationSchemeKind = "saving" | "fast";

export type PlanStatus =
  | "draft"
  | "collecting"
  | "ready"
  | "calculating"
  | "completed";

export type City = {
  code: string;
  name: string;
  province: string;
  lat: number;
  lng: number;
  isProvincialCapital?: boolean;
  isMunicipality?: boolean;
  isAirportHub?: boolean;
  isRailHub?: boolean;
};

export type ParticipantInput = {
  name: string;
  departureCityCode: string;
  departureCityName: string;
  acceptedModes: TransportMode[];
};
