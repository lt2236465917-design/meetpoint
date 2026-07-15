import type { TransportMode, TravelOption } from "@/types/domain";

export type TravelSearchInput = {
  participantId: string;
  originCityCode: string;
  originCityName: string;
  destinationCityCode: string;
  destinationCityName: string;
  meetingDate: string;
  departureDate?: string;
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
  departureDate: string;
  mode: TransportMode;
};

export type GatewayTravelOption = Omit<
  TravelOption,
  "participantId" | "candidateCityCode" | "waitMinutes" | "failureReason"
> & {
  quoteId: string;
  providerQuoteId: string | null;
};

export type GatewaySearchResponse = {
  options: GatewayTravelOption[];
  queriedAt: string;
  traceId: string;
  cache: "hit" | "miss";
};
