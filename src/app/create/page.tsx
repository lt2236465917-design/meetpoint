"use client";

import Link from "next/link";
import { useState } from "react";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";

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
    if (!title.trim()) {
      setError("请输入计划名称");
      return;
    }
    if (!meetingDate) {
      setError("请选择见面日期");
      return;
    }
    if (!targetArrivalTime) {
      setError("请选择目标到达时间");
      return;
    }
    if (participantLimit < 2 || participantLimit > 6) {
      setError("参与人数需在 2-6 人之间");
      return;
    }

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
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(getApiErrorMessage(json.error, "创建失败，请稍后重试"));
      }
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ResponsiveShell
      title="创建见面计划"
      description="先填最少信息，发给朋友后再一起补全。"
      aside={
        <p className="text-center text-xs leading-5 text-gray-500">
          管理口令只出现一次，请创建后保存好。
        </p>
      }
    >
      {!result ? (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
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
          <div className="grid grid-cols-2 gap-3">
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
              onChange={(event) =>
                setParticipantLimit(Number(event.target.value))
              }
            />
          </div>
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
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-950">{title}</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {meetingDate} 到达 {targetArrivalTime} · {participantLimit} 人
            </p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div>
              <p className="text-xs font-medium text-gray-500">公开链接</p>
              <p className="mt-1 break-all text-sm font-semibold text-gray-950">
                {result.shareUrl}
              </p>
            </div>
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-500">管理口令</p>
              <p className="mt-1 break-all text-sm font-semibold leading-6 text-gray-950">
                {result.manageToken}
              </p>
            </div>
            <p className="mt-3 text-xs leading-5 text-gray-500">
              请保存管理口令，后续编辑和计算需要它。
            </p>
            <Link
              className="mt-4 block rounded-lg bg-black py-3 text-center text-sm font-medium text-white"
              href={result.shareUrl}
            >
              打开公开链接
            </Link>
          </section>
        </div>
      )}
    </ResponsiveShell>
  );
}
