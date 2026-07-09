"use client";

import { use, useState } from "react";
import { CityCombobox } from "@/components/forms/CityCombobox";
import { TransportModePicker } from "@/components/forms/TransportModePicker";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";
import type { TransportMode } from "@/types/domain";

type JoinPlanPageProps = {
  params: Promise<{ code: string }>;
};

export default function JoinPlanPage({ params }: JoinPlanPageProps) {
  const { code } = use(params);
  const [name, setName] = useState("");
  const [city, setCity] = useState<{ code: string; name: string } | null>(null);
  const [acceptedModes, setAcceptedModes] = useState<TransportMode[]>([
    "high_speed_rail",
  ]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;
    if (!city) {
      setMessage("请选择出发城市");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`/api/plans/${code}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          departureCityCode: city.code,
          departureCityName: city.name,
          acceptedModes,
        }),
      });
      const json = await res.json();

      if (res.ok) {
        localStorage.setItem(`participant:${code}`, JSON.stringify(json));
        setMessage("已提交，可以返回计划页查看进度。");
        return;
      }

      setMessage(getApiErrorMessage(json.error, "提交失败，请稍后重试"));
    } catch {
      setMessage("提交失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ResponsiveShell
      title="填写出发信息"
      description="只需要你的出发城市和可接受交通方式，用来一起计算合适的见面城市。"
      aside={
        <p className="text-center text-xs leading-5 text-gray-500">
          交通方式只影响你的可接受路线，不会替别人做选择。
        </p>
      }
    >
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <input
          className="w-full rounded-lg border px-4 py-3"
          placeholder="你的名字"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <CityCombobox value={city} onChange={setCity} />
        <TransportModePicker
          value={acceptedModes}
          onChange={setAcceptedModes}
        />
        <button
          className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-60"
          disabled={loading}
          onClick={submit}
        >
          {loading ? "提交中" : "提交"}
        </button>
        {message && (
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {message}
          </p>
        )}
      </div>
    </ResponsiveShell>
  );
}
