"use client";

import Link from "next/link";
import { CityCombobox } from "@/components/forms/CityCombobox";
import { TransportModePicker } from "@/components/forms/TransportModePicker";
import type { TransportMode } from "@/types/domain";

type SelectedCity = { code: string; name: string } | null;

export function JoinParticipantForm({
  code,
  name,
  city,
  acceptedModes,
  loading,
  submitted = false,
  message,
  onNameChange,
  onCityChange,
  onAcceptedModesChange,
  onSubmit,
}: {
  code?: string;
  name: string;
  city: SelectedCity;
  acceptedModes: TransportMode[];
  loading: boolean;
  submitted?: boolean;
  message: string;
  onNameChange: (name: string) => void;
  onCityChange: (city: SelectedCity) => void;
  onAcceptedModesChange: (modes: TransportMode[]) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <label className="block space-y-1.5 text-sm font-medium text-gray-700">
        <span>你的名字</span>
        <input
          className="w-full rounded-lg border px-4 py-3 font-normal text-gray-950"
          placeholder="例如：李雷"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
        />
      </label>
      <div className="space-y-1.5">
        <div className="text-sm font-medium text-gray-700">出发城市</div>
        <CityCombobox
          label="出发城市"
          value={city}
          onChange={onCityChange}
        />
      </div>
      <TransportModePicker
        value={acceptedModes}
        onChange={onAcceptedModesChange}
      />
      <button
        className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-60"
        disabled={loading}
        onClick={onSubmit}
      >
        {loading ? "提交中" : "提交"}
      </button>
      {message && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {message}
        </p>
      )}
      {submitted && code && (
        <Link
          className="block rounded-lg border border-gray-200 py-3 text-center font-medium text-gray-950"
          href={`/p/${code}`}
        >
          返回计划页
        </Link>
      )}
    </div>
  );
}
