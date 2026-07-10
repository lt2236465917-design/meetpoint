import type { TransportMode } from "@/types/domain";

export const transportModeLabels: Record<TransportMode, string> = {
  flight: "飞机",
  high_speed_rail: "高铁/动车",
  normal_train: "普速火车",
};

export function formatTransportModes(modes: TransportMode[]) {
  return modes.map((mode) => transportModeLabels[mode]).join(" / ");
}
