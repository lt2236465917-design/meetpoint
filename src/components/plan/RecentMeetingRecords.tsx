"use client";

import Link, { useLinkStatus } from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  getMeetingHistorySnapshot,
  meetingHistoryUpdatedEvent,
  type MeetingHistoryItem,
} from "@/lib/ui/meeting-history";
import { copyTextToClipboard } from "@/lib/ui/clipboard";

const roleLabels: Record<MeetingHistoryItem["role"], string> = {
  host: "发起的计划",
  participant: "填写过的计划",
  viewer: "看过的计划",
};

const actionLabels: Record<MeetingHistoryItem["role"], string> = {
  host: "创建于",
  participant: "填写于",
  viewer: "查看于",
};

const emptyMeetingRecordsSnapshot: MeetingHistoryItem[] = [];
const compactRecordCount = 3;

export function RecentMeetingRecords({
  showHeading = true,
}: {
  showHeading?: boolean;
} = {}) {
  const records = useSyncExternalStore(
    subscribeToMeetingHistory,
    getMeetingHistorySnapshot,
    getEmptyMeetingRecordsSnapshot,
  );

  return (
    <RecentMeetingRecordsView records={records} showHeading={showHeading} />
  );
}

export function getEmptyMeetingRecordsSnapshot() {
  return emptyMeetingRecordsSnapshot;
}

export function RecentMeetingRecordsView({
  records,
  showHeading = true,
}: {
  records: MeetingHistoryItem[];
  showHeading?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copyMessageCode, setCopyMessageCode] = useState<string | null>(null);
  const visibleRecords = expanded
    ? records
    : records.slice(0, compactRecordCount);
  const hiddenCount = Math.max(records.length - compactRecordCount, 0);

  async function copyPlanLink(record: MeetingHistoryItem) {
    const planUrl = getPlanUrl(record.code);
    const copied = await copyTextToClipboard(planUrl);
    setCopyMessageCode(record.code);
    if (!copied) window.prompt("复制失败，请长按链接手动复制", planUrl);
  }

  return (
    <section className="atmosphere-panel rounded-xl p-5">
      {(showHeading || records.length > 0) && (
        <div className="flex items-center justify-between gap-3">
          {showHeading ? (
            <h2 className="font-display text-base font-medium text-[var(--atmosphere-ink)]">
              最近见面记录
            </h2>
          ) : (
            <span className="sr-only">最近见面记录</span>
          )}
          {records.length > 0 && (
            <span className="ml-auto text-xs text-[var(--atmosphere-muted)]">
              本机保存
            </span>
          )}
        </div>
      )}

      {records.length === 0 ? (
        <p
          className={`text-sm leading-6 text-[var(--atmosphere-muted)] ${
            showHeading ? "mt-3" : ""
          }`}
        >
          还没有见面记录。发起或加入一场见面后，它会在这里等你。
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {visibleRecords.map((record) => (
            <article
              className="rounded-lg border border-white/10 px-3 py-3"
              key={record.code}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--atmosphere-ink)]">
                    {record.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--atmosphere-muted)]">
                    {actionLabels[record.role]}{" "}
                    {formatVisitedAt(record.lastVisitedAt)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--atmosphere-muted)]">
                    {record.arrivalDate} 到达 · {roleLabels[record.role]}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    aria-label={`复制${record.title}邀请链接`}
                    className="atmosphere-ghost rounded-lg px-3 py-1.5 text-xs font-medium"
                    data-copy-plan-code={record.code}
                    onClick={() => void copyPlanLink(record)}
                    type="button"
                  >
                    {copyMessageCode === record.code ? "已复制" : "复制链接"}
                  </button>
                  <Link
                    aria-label={`查看${record.title}填写情况`}
                    className="atmosphere-ghost rounded-lg px-3 py-1.5 text-xs font-medium"
                    href={`/p/${record.code}`}
                  >
                    <ViewPlanLinkLabel />
                  </Link>
                </div>
              </div>
            </article>
          ))}
          {hiddenCount > 0 && !expanded && (
            <button
              className="atmosphere-ghost rounded-lg border-dashed py-2 text-sm font-medium"
              onClick={() => setExpanded(true)}
              type="button"
            >
              更多记录 · 还有 {hiddenCount} 条
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ViewPlanLinkLabel() {
  const { pending } = useLinkStatus();
  return pending ? "正在打开…" : "查看";
}

function getPlanUrl(code: string): string {
  const path = `/p/${code}`;
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function formatVisitedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";

  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

export function subscribeToMeetingHistory(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(meetingHistoryUpdatedEvent, onStoreChange);
  window.addEventListener("pageshow", onStoreChange);
  window.addEventListener("focus", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(meetingHistoryUpdatedEvent, onStoreChange);
    window.removeEventListener("pageshow", onStoreChange);
    window.removeEventListener("focus", onStoreChange);
  };
}
