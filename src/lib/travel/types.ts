import type { TransportMode } from "@/types/domain";

export type GatewaySearchRequest = {
  originCityCode: string;
  originCityName: string;
  destinationCityCode: string;
  destinationCityName: string;
  departureDate: string;
  mode: TransportMode;
};
