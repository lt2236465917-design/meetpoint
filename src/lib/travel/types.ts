import type { TransportMode, TravelOption } from "@/types/domain";

export type TravelSearchInput = {
  participantId: string;
  originCityCode: string;
  originCityName: string;
  destinationCityCode: string;
  destinationCityName: string;
  meetingDate: string;
  targetArrivalTime: string;
  acceptedModes: TransportMode[];
};

export type TravelProvider = {
  search(input: TravelSearchInput): Promise<TravelOption[]>;
};

export type GatewaySearchRequest = {
  originCityCode: string;
  originCityName: string;
  destinationCityCode: string;
  destinationCityName: string;
  meetingDate: string;
  mode: TransportMode;
};

export type GatewayTravelOption = Omit<
  TravelOption,
  "participantId" | "candidateCityCode" | "waitMinutes" | "failureReason"
>;

export type GatewaySearchResponse = {
  options: GatewayTravelOption[];
  queriedAt: string;
  cache: "hit" | "miss";
};
