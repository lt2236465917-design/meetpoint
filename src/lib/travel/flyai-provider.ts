import type { TravelOption } from "@/types/domain";
import { estimateTravelOption } from "./estimate-provider";
import type { TravelProvider, TravelSearchInput } from "./types";

export class FlyAITravelProvider implements TravelProvider {
  async search(input: TravelSearchInput): Promise<TravelOption[]> {
    const cliPath = process.env.FLYAI_CLI_PATH;
    if (!cliPath) {
      return input.acceptedModes.map((mode) => estimateTravelOption(input, mode));
    }

    return input.acceptedModes.map((mode) => estimateTravelOption(input, mode));
  }
}
