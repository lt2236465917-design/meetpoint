"use client";

import { use, useState } from "react";
import { CityCombobox } from "@/components/forms/CityCombobox";
import { TransportModePicker } from "@/components/forms/TransportModePicker";
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

      setMessage(json.error || "提交失败");
    } catch {
      setMessage("提交失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold text-gray-950">填写出发信息</h1>
      <p className="mt-2 text-sm text-gray-500">
        只需要你的出发城市和可接受交通方式，用来一起计算合适的见面城市。
      </p>

      <div className="mt-6 space-y-4">
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
    </main>
  );
}
