"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ParticipantList } from "@/components/plan/ParticipantList";
import {
  advanceAutomaticRun,
  getRunProgressMessage,
  isNonterminal,
  nextRefreshDelayMs,
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
  const latestRunRef = useRef(data.latestRun);
  const isCalculatingResult = data.latestRun
    ? isNonterminal(data.latestRun.status)
    : false;
  const hasCompletedResult = data.latestRun?.status === "completed";
  const terminalFailure =
    data.latestRun?.status === "incomplete" ||
    data.latestRun?.status === "failed";
  const participantsFull =
    data.participants.length >= data.plan.participant_limit;
  const canCalculateHere =
    Boolean(localParticipantEditToken) && participantsFull && !data.latestRun;
  const missingParticipants = Math.max(
    data.plan.participant_limit - data.participants.length,
    0,
  );
  const statusMessage = resolveStatusMessage({
    latestRun: data.latestRun,
    isCalculatingResult,
    hasCompletedResult,
    canCalculateHere,
    participantsFull,
    missingParticipants,
  });

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
    latestRunRef.current = data.latestRun;
  }, [data.latestRun]);

  useEffect(() => {
    let active = true;

    async function refresh(currentRun = latestRunRef.current) {
      if (
        currentRun &&
        isNonterminal(currentRun.status) &&
        localParticipantEditToken &&
        currentRun.runId
      ) {
        await advanceAutomaticRun({
          code,
          runId: currentRun.runId,
          participantToken: localParticipantEditToken,
        }).catch(() => false);
      }

      try {
        const response = await fetch(`/api/plans/${code}`, {
          cache: "no-store",
        });
        if (!response.ok) return null;
        const nextData = (await response.json()) as PublicPlanData;
        if (active) {
          latestRunRef.current = nextData.latestRun;
          setData(nextData);
        }
        return nextData;
      } catch {
        // Keep the last good view; this is a background freshness check.
        return null;
      }
    }

    let refreshCount = 0;
    let timer: number | undefined;

    function scheduleRefresh(latestRun: PublicRunProgress | null) {
      if (!active || !latestRun || !isNonterminal(latestRun.status)) return;
      const delay = nextRefreshDelayMs(refreshCount);
      timer = window.setTimeout(async () => {
        refreshCount += 1;
        const nextData = await refresh(latestRunRef.current ?? latestRun);
        scheduleRefresh(
          nextData?.latestRun ?? latestRunRef.current ?? latestRun,
        );
      }, delay);
    }

    void refresh(latestRunRef.current ?? initialData.latestRun).then(
      (nextData) => {
        scheduleRefresh(nextData?.latestRun ?? initialData.latestRun);
      },
    );

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [code, initialData.latestRun, localParticipantEditToken]);

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
          getApiErrorMessage(json.error, "这次没安排成，稍后再试一次"),
        );
        return;
      }

      setCalculateMessage("正在打开结果页。");
      window.location.href = `/p/${code}/result`;
    } catch {
      setCalculateMessage("这次没安排成，稍后再试一次");
    } finally {
      setCalculating(false);
    }
  }

  return (
    <div className="space-y-5" data-auto-refresh="participants">
      <section className="atmosphere-panel rounded-xl p-5">
        <div role="status" aria-live="polite">
          <Notice>{statusMessage}</Notice>
        </div>

        <div className="mt-4 space-y-2">
          {!participantsFull ? (
            <Link
              className="atmosphere-cta block w-full rounded-xl py-3 text-center font-medium"
              href={`/p/${code}/join`}
            >
              加入这场见面
            </Link>
          ) : null}

          {canCalculateHere ? (
            <button
              className="atmosphere-cta w-full rounded-xl py-3 text-center font-medium disabled:opacity-60"
              disabled={calculating}
              onClick={calculate}
              type="button"
            >
              {calculating ? "见面安排中" : "开始见面"}
            </button>
          ) : null}

          {isCalculatingResult ? (
            <>
              <Link
                className="atmosphere-cta block w-full rounded-xl py-3 text-center font-medium"
                href={`/p/${code}/result`}
              >
                看看安排进度
              </Link>
              <p className="text-xs leading-5 text-[var(--atmosphere-muted)]">
                可以离开，系统会继续安排；点上面可随时回来看进度。
              </p>
            </>
          ) : null}

          {terminalFailure ? (
            <Link
              className="atmosphere-cta block w-full rounded-xl py-3 text-center font-medium"
              href={`/p/${code}/result`}
            >
              去重新查询
            </Link>
          ) : null}

          {hasCompletedResult ? (
            <>
              <Link
                className="atmosphere-cta block w-full rounded-xl py-3 text-center font-medium"
                href={`/p/${code}/result`}
              >
                看结果
              </Link>
              <Link
                className="atmosphere-ghost block w-full rounded-xl py-3 text-center font-medium"
                href={`/p/${code}/alternatives`}
              >
                换个城市看看
              </Link>
            </>
          ) : null}

          {calculateMessage ? (
            <p className="text-xs leading-5 text-[var(--atmosphere-muted)]">
              {calculateMessage}
            </p>
          ) : null}
        </div>

        <div className="mt-5 border-t border-white/10 pt-5">
          <h2 className="mb-3 font-medium text-[var(--atmosphere-ink)]">
            已填写
          </h2>
          {data.participants.length ? (
            <ParticipantList participants={data.participants} />
          ) : (
            <Notice>还没有人填，把链接发到群里吧。</Notice>
          )}
        </div>
      </section>
    </div>
  );
}

function resolveStatusMessage({
  latestRun,
  isCalculatingResult,
  hasCompletedResult,
  canCalculateHere,
  participantsFull,
  missingParticipants,
}: {
  latestRun: PublicRunProgress | null;
  isCalculatingResult: boolean;
  hasCompletedResult: boolean;
  canCalculateHere: boolean;
  participantsFull: boolean;
  missingParticipants: number;
}) {
  if (isCalculatingResult && latestRun) {
    return getRunProgressMessage(latestRun);
  }
  if (hasCompletedResult) {
    return "选好了，去看见面城市";
  }
  if (latestRun) {
    return getRunProgressMessage(latestRun);
  }
  if (canCalculateHere) {
    return "人齐了！点一下，看看这次去哪座城见。";
  }
  if (participantsFull) {
    return "人齐了，等一位填过资料的朋友来点「开始见面」。";
  }
  return `还差 ${missingParticipants} 位朋友。人齐之后，填过的人都能点「开始见面」。`;
}

function readLocalParticipantEditToken(code: string): string {
  return (
    readMeetingHistory().find(
      (record) => record.code === code && record.participantEditToken,
    )?.participantEditToken ?? ""
  );
}
