"use client";

import type { TransportMode } from "@/types/domain";

const modes: Array<{ value: TransportMode; label: string }> = [
  { value: "flight", label: "飞机" },
  { value: "high_speed_rail", label: "高铁/动车" },
  { value: "normal_train", label: "普速火车" },
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
