"use client";

import { useState } from "react";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";
import { copyTextToClipboard } from "@/lib/ui/clipboard";
import { parseCreatePlanForm } from "@/lib/ui/create-plan-form";
import { rememberMeetingHistoryItem } from "@/lib/ui/meeting-history";

type CreatePlanResult = {
  code: string;
  shareUrl: string;
};

export default function CreatePlanPage() {
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [targetArrivalTime, setTargetArrivalTime] = useState("18:00");
  const [participantLimit, setParticipantLimit] = useState(4);
  const [result, setResult] = useState<CreatePlanResult | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const parsed = parseCreatePlanForm(
      new FormData(event.currentTarget),
    );
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const form = parsed.data;

    setLoading(true);
    setError("");
    setCopyMessage("");
    setResult(null);

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(getApiErrorMessage(json.error, "创建失败，请稍后重试"));
      }
      setTitle(form.title);
      setMeetingDate(form.meetingDate);
      setTargetArrivalTime(form.targetArrivalTime);
      setParticipantLimit(form.participantLimit);
      setResult(json);
      rememberMeetingHistoryItem({
        code: json.code,
        title: form.title,
        meetingDate: form.meetingDate,
        targetArrivalTime: form.targetArrivalTime,
        role: "host",
        latestRun: false,
        lastVisitedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  async function copyPublicLink() {
    if (!result) return;

    const publicLink = getPublicShareUrl(result.shareUrl);
    const copied = await copyTextToClipboard(publicLink);
    setCopyMessage(
      copied
        ? "公开链接已复制，可以直接发给朋友填写。"
        : "复制失败，请长按链接手动复制。",
    );
  }

  const publicShareUrl = result ? getPublicShareUrl(result.shareUrl) : "";

  return (
    <ResponsiveShell
      title="创建见面计划"
      description="先填最少信息，发给朋友后再一起补全。"
      backHref="/"
      aside={
        <p className="text-center text-xs leading-5 text-gray-500">
          创建后复制链接发给朋友，大家填满后就能一起计算。
        </p>
      }
    >
      {!result ? (
        <form
          className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          method="dialog"
          onSubmit={submit}
        >
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">
            <span>计划名称</span>
            <input
              className="w-full rounded-lg border px-4 py-3 font-normal text-gray-950"
              name="title"
              placeholder="例如：上海周末见面"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-gray-700">
            <span>见面日期</span>
            <input
              className="w-full rounded-lg border px-4 py-3 font-normal text-gray-950"
              name="meetingDate"
              type="date"
              value={meetingDate}
              onChange={(event) => setMeetingDate(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1.5 text-sm font-medium text-gray-700">
              <span>目标到达时间</span>
              <input
                className="w-full rounded-lg border px-4 py-3 font-normal text-gray-950"
                name="targetArrivalTime"
                type="time"
                value={targetArrivalTime}
                onChange={(event) => setTargetArrivalTime(event.target.value)}
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-gray-700">
              <span>参与人数上限</span>
              <input
                className="w-full rounded-lg border px-4 py-3 font-normal text-gray-950"
                name="participantLimit"
                type="number"
                min={2}
                max={6}
                value={participantLimit}
                onChange={(event) =>
                  setParticipantLimit(Number(event.target.value))
                }
              />
            </label>
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}
          <button
            className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "创建中" : "创建并生成链接"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-950">{title}</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {meetingDate} 到达 {targetArrivalTime} · {participantLimit} 人
            </p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-gray-500">参与填写链接</p>
            <p className="mt-2 break-all rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium leading-6 text-gray-950">
              {publicShareUrl}
            </p>
            <button
              className="mt-3 w-full rounded-lg bg-black py-3 text-sm font-medium text-white"
              onClick={copyPublicLink}
              type="button"
            >
              复制公开链接
            </button>
            {copyMessage && (
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {copyMessage}
              </p>
            )}
          </section>
        </div>
      )}
    </ResponsiveShell>
  );
}

function getPublicShareUrl(shareUrl: string): string {
  if (/^https?:\/\//.test(shareUrl)) return shareUrl;
  if (typeof window === "undefined") return shareUrl;
  return new URL(shareUrl, window.location.origin).toString();
}
