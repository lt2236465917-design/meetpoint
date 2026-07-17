"use client";

import { useRef, useState } from "react";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";
import { copyTextToClipboard } from "@/lib/ui/clipboard";
import { parseCreatePlanForm } from "@/lib/ui/create-plan-form";
import { rememberMeetingHistoryItem } from "@/lib/ui/meeting-history";

type CreatePlanResult = {
  code: string;
  shareUrl: string;
  hostToken: string;
};

export default function CreatePlanPage() {
  const [title, setTitle] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [participantLimit, setParticipantLimit] = useState(4);
  const [participantLimitOpen, setParticipantLimitOpen] = useState(false);
  const arrivalDateInputRef = useRef<HTMLInputElement>(null);
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
      setArrivalDate(form.arrivalDate);
      setParticipantLimit(form.participantLimit);
      setResult(json);
      rememberMeetingHistoryItem({
        code: json.code,
        title: form.title,
        arrivalDate: form.arrivalDate,
        role: "host",
        hostToken: json.hostToken,
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
        ? "链接已复制，去群里喊人吧。"
        : "复制失败，请长按链接手动复制。",
    );
  }

  const publicShareUrl = result ? getPublicShareUrl(result.shareUrl) : "";

  return (
    <ResponsiveShell
      title="创建见面计划"
      description="三十秒填完，剩下的交给朋友们。"
      backHref="/"
      aside={
        <p className="text-center text-xs leading-5 text-gray-500">
          建好后把链接发到群里，人到齐就能开算。
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
              placeholder="例如：老友五月见面局"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div
            className="block space-y-1.5 text-sm font-medium text-gray-700"
          >
            <span id="arrival-date-label">计划到达日期</span>
            <div className="relative">
              <input
                aria-labelledby="arrival-date-label"
                className="native-picker-hit-area w-full rounded-lg border px-4 py-3 pr-12 font-normal text-gray-950"
                name="arrivalDate"
                ref={arrivalDateInputRef}
                type="date"
                value={arrivalDate}
                onChange={(event) => setArrivalDate(event.target.value)}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-center"
              >
                <CalendarIcon />
              </span>
            </div>
          </div>
          <div className="relative block space-y-1.5 text-sm font-medium text-gray-700">
              <span id="participant-limit-label">参与人数上限</span>
              <input name="participantLimit" type="hidden" value={participantLimit} />
              <button
                aria-controls="participant-limit-options"
                aria-expanded={participantLimitOpen}
                aria-haspopup="listbox"
                aria-labelledby="participant-limit-label participant-limit-value"
                className="flex w-full items-center justify-between rounded-lg border px-4 py-3 font-normal text-gray-950"
                onClick={() => setParticipantLimitOpen((open) => !open)}
                type="button"
              >
                <span id="participant-limit-value">{participantLimit} 人</span>
                <ChevronDownIcon expanded={participantLimitOpen} />
              </button>
              {participantLimitOpen && (
                <div
                  className="absolute z-10 mt-2 w-full overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                  id="participant-limit-options"
                  role="listbox"
                  aria-labelledby="participant-limit-label"
                >
                  {[2, 3, 4, 5, 6].map((limit) => (
                    <button
                      aria-selected={participantLimit === limit}
                      className="flex w-full rounded-md px-3 py-2 text-left text-sm font-normal text-gray-950 hover:bg-gray-100 aria-selected:bg-gray-100"
                      key={limit}
                      onClick={() => {
                        setParticipantLimit(limit);
                        setParticipantLimitOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      {limit} 人
                    </button>
                  ))}
                </div>
              )}
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
            {loading ? "创建中" : "生成邀请链接"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-950">{title}</p>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              {arrivalDate} 到达 · {participantLimit} 人
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

function CalendarIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <rect height="16" rx="2" stroke="currentColor" strokeWidth="2" width="16" x="4" y="5" />
      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ChevronDownIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function getPublicShareUrl(shareUrl: string): string {
  if (/^https?:\/\//.test(shareUrl)) return shareUrl;
  if (typeof window === "undefined") return shareUrl;
  return new URL(shareUrl, window.location.origin).toString();
}
