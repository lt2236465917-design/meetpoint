"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ParticipantList } from "@/components/plan/ParticipantList";
import {
  getRunProgressMessage,
  isNonterminal,
  type PublicRunProgress,
} from "@/components/result/RefreshingResultNotice";
import { Notice } from "@/components/ui/Notice";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";
import {
  readMeetingHistory,
  rememberMeetingHistoryItem,
} from "@/lib/ui/meeting-history";
import type { TransportMode } from "@/types/domain";

type PublicPlanData = {
  plan: {
    title: string;
    meeting_date: string;
    participant_limit: number;
  };
  participants: Array<{
    id: string;
    name: string;
    departure_city_name: string;
    accepted_modes: TransportMode[];
  }>;
  localParticipantEditToken?: string;
  latestRun: PublicRunProgress | null;
};

export function PublicPlanContent({
  code,
  initialData,
}: {
  code: string;
  initialData: PublicPlanData;
}) {
  const [data, setData] = useState(initialData);
  const [localParticipantEditToken] = useState(
    () =>
      initialData.localParticipantEditToken ??
      readLocalParticipantEditToken(code),
  );
  const [calculateMessage, setCalculateMessage] = useState("");
  const [calculating, setCalculating] = useState(false);
  const isCalculatingResult = data.latestRun
    ? isNonterminal(data.latestRun.status)
    : false;
  const hasCompletedResult = data.latestRun?.status === "completed";
  const participantsFull =
    data.participants.length >= data.plan.participant_limit;
  const canCalculateHere =
    Boolean(localParticipantEditToken) && participantsFull && !data.latestRun;
  const missingParticipants = Math.max(
    data.plan.participant_limit - data.participants.length,
    0,
  );

  useEffect(() => {
    rememberMeetingHistoryItem({
      code,
      title: initialData.plan.title,
      arrivalDate: initialData.plan.meeting_date,
      role: "viewer",
      latestRun: initialData.latestRun?.status === "completed",
      lastVisitedAt: new Date().toISOString(),
    });
  }, [code, initialData.latestRun, initialData.plan]);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch(`/api/plans/${code}`, {
          cache: "no-store",
        });
        if (!response.ok) return null;
        const nextData = (await response.json()) as PublicPlanData;
        if (active) {
          setData(nextData);
        }
        return nextData;
      } catch {
        // Keep the last good view; this is a background freshness check.
        return null;
      }
    }

    const delays = [2_000, 3_000, 5_000, 8_000, 13_000, 21_000];
    let refreshCount = 0;
    let timer: number | undefined;

    function scheduleRefresh(latestRun: PublicRunProgress | null) {
      if (!active || !latestRun || !isNonterminal(latestRun.status)) return;
      const delay = delays[refreshCount];
      if (delay === undefined) return;
      timer = window.setTimeout(async () => {
        refreshCount += 1;
        const nextData = await refresh();
        scheduleRefresh(nextData?.latestRun ?? latestRun);
      }, delay);
    }

    void refresh().then((nextData) => {
      scheduleRefresh(nextData?.latestRun ?? initialData.latestRun);
    });

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [code, initialData.latestRun]);

  async function calculate() {
    if (calculating || !localParticipantEditToken) return;

    setCalculating(true);
    setCalculateMessage("");

    try {
      const response = await fetch(`/api/plans/${code}/calculate`, {
        method: "POST",
        headers: { "x-participant-token": localParticipantEditToken },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCalculateMessage(
          getApiErrorMessage(json.error, "计算失败，请稍后重试"),
        );
        return;
      }

      setCalculateMessage("正在打开结果页。");
      window.location.href = `/p/${code}/result`;
    } catch {
      setCalculateMessage("计算失败，请稍后重试");
    } finally {
      setCalculating(false);
    }
  }

  return (
    <div className="space-y-5" data-auto-refresh="participants">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-medium text-gray-950">下一步</h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            className="rounded-lg bg-black py-3 text-center font-medium text-white"
            href={`/p/${code}/join`}
          >
            加入这场见面
          </Link>
          {hasCompletedResult ? (
            <Link
              className="rounded-lg border border-gray-200 py-3 text-center font-medium text-gray-950"
              href={`/p/${code}/result`}
            >
              看结果
            </Link>
          ) : (
            <div
              aria-disabled="true"
              className="rounded-lg border border-gray-200 bg-gray-50 py-3 text-center font-medium text-gray-400"
            >
              {isCalculatingResult ? "结果生成中" : "暂无结果"}
            </div>
          )}
        </div>
        {hasCompletedResult ? (
          <Link
            className="mt-3 block w-full rounded-lg border border-gray-200 py-3 text-center font-medium text-gray-950"
            href={`/p/${code}/alternatives`}
          >
            换个城市看看
          </Link>
        ) : null}
        {canCalculateHere ? (
          <div className="mt-4">
            <Notice>
              人齐了！{data.participants.length} 位朋友都填好了，可以开始算这次去哪座城。
            </Notice>
            <button
              className="mt-3 w-full rounded-lg bg-black py-3 text-center font-medium text-white disabled:opacity-60"
              disabled={calculating}
              onClick={calculate}
              type="button"
            >
              {calculating ? "计算中" : "算出见面城市"}
            </button>
            {calculateMessage && (
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {calculateMessage}
              </p>
            )}
          </div>
        ) : isCalculatingResult ? (
          <div className="mt-4">
            <Notice>{getRunProgressMessage(data.latestRun!)}</Notice>
          </div>
        ) : !data.latestRun ? (
          <div className="mt-4">
            <Notice>
              {participantsFull
                ? "人齐了，等一位填写过的朋友来发起计算。"
                : `还差 ${missingParticipants} 位朋友。人齐之后，填过的人都能发起计算。`}
            </Notice>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-medium text-gray-950">填写记录</h2>
        {data.participants.length ? (
          <ParticipantList participants={data.participants} />
        ) : (
          <Notice>还没有人填，把链接发到群里吧。</Notice>
        )}
      </section>

      <p className="text-center text-xs leading-5 text-gray-500">
        已填写 {data.participants.length} 人 ·{" "}
        {isCalculatingResult
          ? "正在生成结果"
          : hasCompletedResult
            ? "已有结果"
            : "就等一声开算了"}
      </p>
    </div>
  );
}

function readLocalParticipantEditToken(code: string): string {
  return (
    readMeetingHistory().find(
      (record) => record.code === code && record.participantEditToken,
    )?.participantEditToken ?? ""
  );
}
