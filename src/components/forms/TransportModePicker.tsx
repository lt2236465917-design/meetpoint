"use client";

import type { TransportMode } from "@/types/domain";
import { transportModeLabels } from "@/lib/ui/transport-modes";

const modes: Array<{ value: TransportMode; label: string }> = [
  { value: "flight", label: transportModeLabels.flight },
  { value: "high_speed_rail", label: transportModeLabels.high_speed_rail },
  { value: "normal_train", label: transportModeLabels.normal_train },
];

export function TransportModePicker({
  value,
  onChange,
}: {
  value: TransportMode[];
  onChange: (value: TransportMode[]) => void;
}) {
  function toggle(mode: TransportMode) {
    onChange(
      value.includes(mode)
        ? value.filter((item) => item !== mode)
        : [...value, mode],
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {modes.map((mode) => {
        const selected = value.includes(mode.value);

        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => toggle(mode.value)}
            className={`rounded-lg border px-3 py-3 text-sm font-medium ${
              selected
                ? "border-black bg-black text-white"
                : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
