"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ParticipantList } from "@/components/plan/ParticipantList";
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
    target_arrival_time: string;
    participant_limit: number;
  };
  participants: Array<{
    id: string;
    name: string;
    departure_city_name: string;
    accepted_modes: TransportMode[];
  }>;
  localParticipantEditToken?: string;
  latestRun: unknown | null;
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
      meetingDate: initialData.plan.meeting_date,
      targetArrivalTime: initialData.plan.target_arrival_time,
      role: "viewer",
      latestRun: Boolean(initialData.latestRun),
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
        if (!response.ok) return;
        const nextData = (await response.json()) as PublicPlanData;
        if (active) {
          setData(nextData);
        }
      } catch {
        // Keep the last good view; this is a background freshness check.
      }
    }

    const interval = window.setInterval(refresh, 3000);
    void refresh();

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [code]);

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

      setCalculateMessage(`计算完成：${json.candidateCount} 个候选城市`);
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
            填写我的信息
          </Link>
          <Link
            className="rounded-lg border border-gray-200 py-3 text-center font-medium text-gray-950"
            href={`/p/${code}/result`}
          >
            看结果
          </Link>
        </div>
        {canCalculateHere ? (
          <div className="mt-4">
            <Notice>
              {data.participants.length} 人已填满，可以开始计算。
            </Notice>
            <button
              className="mt-3 w-full rounded-lg bg-black py-3 text-center font-medium text-white disabled:opacity-60"
              disabled={calculating}
              onClick={calculate}
              type="button"
            >
              {calculating ? "计算中" : "开始计算"}
            </button>
            {calculateMessage && (
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {calculateMessage}
              </p>
            )}
          </div>
        ) : !data.latestRun ? (
          <div className="mt-4">
            <Notice>
              {participantsFull
                ? "已填满，只有填写过这份计划的人可以开始计算。"
                : `还差 ${missingParticipants} 人，填满后已填写者可发起。`}
            </Notice>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-medium text-gray-950">填写记录</h2>
        {data.participants.length ? (
          <ParticipantList participants={data.participants} />
        ) : (
          <Notice>还没有人填写。</Notice>
        )}
      </section>

      <p className="text-center text-xs leading-5 text-gray-500">
        已填写 {data.participants.length} 人 ·{" "}
        {data.latestRun ? "已有结果" : "等待发起人计算"}
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
