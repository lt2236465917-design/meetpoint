"use client";

import { useEffect, useRef, useState } from "react";
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
  const participantLimitRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<CreatePlanResult | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!participantLimitOpen) return;

    function handleMouseDown(event: MouseEvent) {
      if (
        participantLimitRef.current &&
        !participantLimitRef.current.contains(event.target as Node)
      ) {
        setParticipantLimitOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setParticipantLimitOpen(false);
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [participantLimitOpen]);

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
        <p className="text-center text-xs leading-5">
          建好后把链接发到群里，人到齐就能开始见面。
        </p>
      }
    >
      {!result ? (
        <form
          className="atmosphere-panel space-y-3 rounded-xl p-4"
          method="dialog"
          onSubmit={submit}
        >
          <label className="block space-y-1.5 text-sm font-medium text-[var(--atmosphere-muted)]">
            <span>计划名称</span>
            <input
              className="atmosphere-field w-full rounded-lg px-4 py-3 font-normal"
              name="title"
              placeholder="例如：老友五月见面局"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <div className="block space-y-1.5 text-sm font-medium text-[var(--atmosphere-muted)]">
            <span id="arrival-date-label">计划到达日期</span>
            <div className="relative">
              <input
                aria-labelledby="arrival-date-label"
                className="atmosphere-field native-picker-hit-area w-full rounded-lg px-4 py-3 pr-12 font-normal"
                name="arrivalDate"
                ref={arrivalDateInputRef}
                type="date"
                value={arrivalDate}
                onChange={(event) => setArrivalDate(event.target.value)}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[var(--atmosphere-muted)]"
              >
                <CalendarIcon />
              </span>
            </div>
          </div>
          <div
            className="relative block space-y-1.5 text-sm font-medium text-[var(--atmosphere-muted)]"
            ref={participantLimitRef}
          >
            <span id="participant-limit-label">参与人数上限</span>
            <input name="participantLimit" type="hidden" value={participantLimit} />
            <button
              aria-controls="participant-limit-options"
              aria-expanded={participantLimitOpen}
              aria-haspopup="listbox"
              aria-labelledby="participant-limit-label participant-limit-value"
              className="atmosphere-field flex w-full items-center justify-between rounded-lg px-4 py-3 font-normal"
              onClick={() => setParticipantLimitOpen((open) => !open)}
              type="button"
            >
              <span id="participant-limit-value">{participantLimit} 人</span>
              <ChevronDownIcon expanded={participantLimitOpen} />
            </button>
            {participantLimitOpen && (
              <div
                className="atmosphere-panel absolute bottom-full z-10 mb-2 w-full overflow-hidden rounded-lg p-1"
                id="participant-limit-options"
                role="listbox"
                aria-labelledby="participant-limit-label"
              >
                {[2, 3, 4, 5, 6].map((limit) => (
                  <button
                    aria-selected={participantLimit === limit}
                    className="flex w-full rounded-md px-3 py-2 text-left text-sm font-normal text-[var(--atmosphere-ink)] hover:bg-white/10 aria-selected:bg-white/10"
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
            <p className="rounded-lg border border-red-300/40 bg-red-500/15 px-3 py-2 text-sm text-red-100">
              {error}
            </p>
          )}
          <button
            className="atmosphere-cta w-full rounded-xl py-3 font-medium disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "创建中" : "生成邀请链接"}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <section className="atmosphere-panel rounded-xl p-4">
            <p className="text-sm font-medium text-[var(--atmosphere-ink)]">{title}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--atmosphere-muted)]">
              {arrivalDate} 到达 · {participantLimit} 人
            </p>
          </section>

          <section className="atmosphere-panel rounded-xl p-4">
            <p className="text-xs font-medium text-[var(--atmosphere-muted)]">参与填写链接</p>
            <p className="atmosphere-field mt-2 break-all rounded-lg px-3 py-2 text-sm font-medium leading-6">
              {publicShareUrl}
            </p>
            <button
              className="atmosphere-cta mt-3 w-full rounded-xl py-3 text-sm font-medium"
              onClick={copyPublicLink}
              type="button"
            >
              复制公开链接
            </button>
            {copyMessage && (
              <p className="mt-2 text-xs leading-5 text-[var(--atmosphere-muted)]">
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
