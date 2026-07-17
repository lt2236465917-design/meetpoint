"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui/Notice";
import type { RunStatus } from "@/lib/agent/contracts";
import { readMeetingHistory } from "@/lib/ui/meeting-history";

const REFRESH_DELAYS_MS = [2_000, 3_000, 5_000, 8_000, 13_000, 21_000];

export type PublicRunProgress = {
  runId: string;
  status: RunStatus;
  traceId: string;
  pendingGroups: number;
  retryAt: string | null;
  diagnosticCode: string | null;
};

export async function advanceAutomaticRun({
  code,
  runId,
  participantToken,
  request = fetch,
}: {
  code: string;
  runId: string;
  participantToken: string;
  request?: typeof fetch;
}) {
  const response = await request(
    `/api/plans/${encodeURIComponent(code)}/runs/${encodeURIComponent(runId)}/advance`,
    {
      method: "POST",
      headers: { "x-participant-token": participantToken },
    },
  );
  return response.ok;
}

export function RefreshingResultNotice({
  code,
  progress,
  now = new Date(),
}: {
  code?: string;
  progress: PublicRunProgress;
  now?: Date;
}) {
  const router = useRouter();
  const [refreshCount, setRefreshCount] = useState(0);
  const autoRefresh = isNonterminal(progress.status);
  const delay = REFRESH_DELAYS_MS[refreshCount];

  const refresh = useCallback(async () => {
    if (code && autoRefresh) {
      const participantToken = readMeetingHistory()
        .find((item) => item.code === code)
        ?.participantEditToken;
      if (participantToken) {
        await advanceAutomaticRun({
          code,
          runId: progress.runId,
          participantToken,
        }).catch(() => false);
      }
    }
    setRefreshCount((count) => count + 1);
    router.refresh();
  }, [autoRefresh, code, progress.runId, router]);

  useEffect(() => {
    if (!autoRefresh || delay === undefined) return;
    const timer = window.setTimeout(() => void refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [autoRefresh, delay, refresh]);

  return (
    <div aria-live="polite" className="space-y-2" role="status">
      <Notice>{getRunProgressMessage(progress, now)}</Notice>
      {progress.status === "incomplete" || progress.status === "failed" ? (
        <p className="text-xs leading-5 text-gray-500">
          诊断编号 {diagnosticRunId(progress.runId)}
        </p>
      ) : null}
      <button
        className="w-full rounded-lg border border-gray-200 py-3 text-sm font-medium text-gray-950"
        onClick={() => void refresh()}
        type="button"
      >
        刷新结果
      </button>
    </div>
  );
}

export function getRunProgressMessage(progress: PublicRunProgress, now = new Date()) {
  switch (progress.status) {
    case "pending":
    case "collecting":
      return `正在替大家查 ${progress.pendingGroups} 组真实车票和机票`;
    case "cooling_down": {
      const seconds = progress.retryAt
        ? Math.max(0, Math.ceil((new Date(progress.retryAt).getTime() - now.getTime()) / 1000))
        : 0;
      return seconds > 0
        ? `票务平台有点忙，${seconds} 秒后自动再试`
        : "票务平台有点忙，正在自动再试";
    }
    case "calculating":
      return "正在挑一座对每个人都公平的城市";
    case "validating":
      return "正在逐条确认每个人的路线真实可订";
    case "awaiting_host_confirmation":
      return "替代城市正在等待发起人确认，共享结果暂不变更";
    case "incomplete":
      return "有几位朋友的票价这次没查全，所以先不出结论。再算一次试试。";
    case "failed":
      return "这次没算成，回计划页再试一次。如果反复失败，把下面这串编号发给发起人。";
    case "completed":
      return "选好了！去看看这次在哪儿见";
  }
}

export function isNonterminal(status: RunStatus) {
  return !["completed", "incomplete", "failed"].includes(status);
}

function diagnosticRunId(runId: string) {
  const suffix = runId.replace(/^run[-_]?/i, "").slice(0, 8).toUpperCase();
  return `RUN-${suffix || runId.slice(0, 8).toUpperCase()}`;
}
