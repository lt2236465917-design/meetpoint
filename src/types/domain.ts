export type TransportMode = "flight" | "high_speed_rail" | "normal_train";

export type PlanStatus =
  | "draft"
  | "collecting"
  | "ready"
  | "calculating"
  | "completed";

export type TravelSource = "real" | "estimated" | "unavailable";

export type TravelProviderName = "flyai" | "amap" | "estimate";

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

export type TravelOption = {
  participantId: string;
  candidateCityCode: string;
  mode: TransportMode;
  source: TravelSource;
  provider: TravelProviderName;
  queriedAt: string | null;
  priceCny: number | null;
  departAt: string | null;
  arriveAt: string | null;
  durationMinutes: number | null;
  waitMinutes: number | null;
  isDirect: boolean;
  hasTransfer: boolean;
  transferCount: number;
  serviceName: string | null;
  departureStationName: string | null;
  arrivalStationName: string | null;
  bookingUrl: string | null;
  failureReason: string | null;
};

export type SelectedParticipantTravelOption = TravelOption & {
  selectionScore: number;
};

export type CityRecommendation = {
  cityCode: string;
  cityName: string;
  totalPriceCny: number;
  avgPriceCny: number;
  totalDurationMinutes: number;
  fairnessGap: number;
  waitingPenalty: number;
  transferPenalty: number;
  estimatePenalty: number;
  missingPenalty: number;
  scoreCheapest: number;
  scoreBalanced: number;
  scoreFastest: number;
  labels: Array<"cheapest" | "balanced" | "fastest">;
  selectedOptions?: SelectedParticipantTravelOption[];
  explanation?: string;
  riskSummary?: string;
};
