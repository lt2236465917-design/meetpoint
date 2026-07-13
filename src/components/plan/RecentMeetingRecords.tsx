"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  getMeetingHistorySnapshot,
  meetingHistoryUpdatedEvent,
  type MeetingHistoryItem,
} from "@/lib/ui/meeting-history";

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

export function RecentMeetingRecords() {
  const records = useSyncExternalStore(
    subscribeToMeetingHistory,
    getMeetingHistorySnapshot,
    getEmptyMeetingRecordsSnapshot,
  );

  return <RecentMeetingRecordsView records={records} />;
}

export function getEmptyMeetingRecordsSnapshot() {
  return emptyMeetingRecordsSnapshot;
}

export function RecentMeetingRecordsView({
  records,
}: {
  records: MeetingHistoryItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRecords = expanded
    ? records
    : records.slice(0, compactRecordCount);
  const hiddenCount = Math.max(records.length - compactRecordCount, 0);

  async function copyPlanLink(record: MeetingHistoryItem) {
    const planUrl = getPlanUrl(record.code);
    try {
      await navigator.clipboard.writeText(planUrl);
    } catch {
      window.prompt("复制失败，请长按链接手动复制", planUrl);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium text-gray-950">最近见面记录</h2>
        {records.length > 0 && (
          <span className="text-xs text-gray-500">本机保存</span>
        )}
      </div>

      {records.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-gray-600">
          这台设备还没有保存见面记录。创建或打开计划后，会出现在这里。
        </p>
      ) : (
        <div className="mt-4 grid gap-2">
          {visibleRecords.map((record) => (
            <article
              className="rounded-lg border border-gray-200 px-3 py-3"
              key={record.code}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-950">
                    {record.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {actionLabels[record.role]}{" "}
                    {formatVisitedAt(record.lastVisitedAt)}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {roleLabels[record.role]}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {record.latestRun !== true && (
                    <button
                      aria-label={`复制${record.title}邀请链接`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-950"
                      data-copy-plan-code={record.code}
                      onClick={() => void copyPlanLink(record)}
                      type="button"
                    >
                      复制链接
                    </button>
                  )}
                  <Link
                    aria-label={`查看${record.title}填写情况`}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-950"
                    href={`/p/${record.code}`}
                  >
                    查看
                  </Link>
                </div>
              </div>
            </article>
          ))}
          {hiddenCount > 0 && !expanded && (
            <button
              className="rounded-lg border border-dashed border-gray-300 py-2 text-sm font-medium text-gray-700"
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
