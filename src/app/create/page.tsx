"use client";

import Link from "next/link";
import { useState } from "react";

type CreatePlanResult = {
  code: string;
  manageToken: string;
  shareUrl: string;
};

export default function CreatePlanPage() {
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [targetArrivalTime, setTargetArrivalTime] = useState("18:00");
  const [participantLimit, setParticipantLimit] = useState(4);
  const [result, setResult] = useState<CreatePlanResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          meetingDate,
          targetArrivalTime,
          participantLimit,
        }),
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "创建失败");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold text-gray-950">创建见面计划</h1>
      <p className="mt-2 text-sm text-gray-500">
        先填最少信息，发给朋友后再一起补全。
      </p>

      <div className="mt-6 space-y-4">
        <input
          className="w-full rounded-lg border px-4 py-3"
          placeholder="计划名称"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <input
          className="w-full rounded-lg border px-4 py-3"
          type="date"
          value={meetingDate}
          onChange={(event) => setMeetingDate(event.target.value)}
        />
        <input
          className="w-full rounded-lg border px-4 py-3"
          type="time"
          value={targetArrivalTime}
          onChange={(event) => setTargetArrivalTime(event.target.value)}
        />
        <input
          className="w-full rounded-lg border px-4 py-3"
          type="number"
          min={2}
          max={6}
          value={participantLimit}
          onChange={(event) => setParticipantLimit(Number(event.target.value))}
        />
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-60"
          disabled={loading}
          onClick={submit}
        >
          {loading ? "创建中" : "创建并生成链接"}
        </button>
      </div>

      {result && (
        <section className="mt-6 rounded-xl border bg-gray-50 p-4">
          <p className="text-sm font-medium">公开链接：{result.shareUrl}</p>
          <p className="mt-2 text-sm font-medium">
            管理口令：{result.manageToken}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            请保存管理口令，后续编辑和计算需要它。
          </p>
          <Link
            className="mt-4 block rounded-lg bg-black py-3 text-center text-sm font-medium text-white"
            href={result.shareUrl}
          >
            打开公开链接
          </Link>
        </section>
      )}
    </main>
  );
}
