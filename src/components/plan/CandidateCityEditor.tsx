"use client";

import { useState } from "react";
import { CityCombobox } from "@/components/forms/CityCombobox";

export function CandidateCityEditor({
  code,
  managementToken,
}: {
  code: string;
  managementToken: string;
}) {
  const [city, setCity] = useState<{ code: string; name: string } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(enabled: boolean) {
    if (!city) {
      setMessage("请先选择城市");
      return;
    }

    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/plans/${code}/candidates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-management-token": managementToken,
      },
      body: JSON.stringify({
        cityCode: city.code,
        cityName: city.name,
        enabled,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setSaving(false);
    setMessage(response.ok ? "已保存候选城市设置" : json.error || "保存失败");
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-medium">候选城市</h2>
      <div className="mt-3">
        <CityCombobox
          value={city}
          onChange={setCity}
          placeholder="选择候选城市"
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          className="rounded-lg bg-black py-2 text-sm text-white disabled:opacity-50"
          disabled={saving}
          onClick={() => save(true)}
          type="button"
        >
          添加
        </button>
        <button
          className="rounded-lg border py-2 text-sm disabled:opacity-50"
          disabled={saving}
          onClick={() => save(false)}
          type="button"
        >
          排除
        </button>
      </div>
      {message && <p className="mt-3 text-sm text-gray-500">{message}</p>}
    </section>
  );
}
