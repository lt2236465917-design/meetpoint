"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PeakScenicAccent } from "@/components/result/PeakScenicAccent";
import { Notice } from "@/components/ui/Notice";
import type { RunStatus } from "@/lib/agent/contracts";
import { readMeetingHistory } from "@/lib/ui/meeting-history";
import type { BaselineRecommendation } from "@/lib/recommendation/baseline";

const REFRESH_DELAYS_MS = [2_000, 3_000, 5_000, 8_000, 13_000, 21_000];

export function nextRefreshDelayMs(
  refreshCount: number,
  delays: readonly number[] = REFRESH_DELAYS_MS,
) {
  if (delays.length === 0) return 21_000;
  return delays[Math.min(Math.max(refreshCount, 0), delays.length - 1)]!;
}

export type PublicRunProgress = {
  runId: string;
  status: RunStatus;
  traceId: string;
  pendingGroups: number;
  retryAt: string | null;
  diagnosticCode: string | null;
  baseline?: BaselineRecommendation | null;
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

export async function restartAutomaticRun({
  code,
  participantToken,
  request = fetch,
}: {
  code: string;
  participantToken: string;
  request?: typeof fetch;
}) {
  const response = await request(
    `/api/plans/${encodeURIComponent(code)}/calculate`,
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
  const [restarting, setRestarting] = useState(false);
  const [restartMessage, setRestartMessage] = useState("");
  const autoRefresh = isNonterminal(progress.status);
  const terminalFailure = progress.status === "incomplete" || progress.status === "failed";
  const delay = nextRefreshDelayMs(refreshCount);

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

  const restart = useCallback(async () => {
    if (!code || restarting) return;
    const participantToken = readMeetingHistory()
      .find((item) => item.code === code)
      ?.participantEditToken;
    if (!participantToken) {
      setRestartMessage("这台设备没有重新查询权限，请返回计划页让已填写的朋友发起。");
      return;
    }

    setRestarting(true);
    setRestartMessage("");
    const restarted = await restartAutomaticRun({
      code,
      participantToken,
    }).catch(() => false);
    if (restarted) {
      router.refresh();
    } else {
      setRestartMessage("重新查询没有启动，请检查服务后再试一次。");
    }
    setRestarting(false);
  }, [code, restarting, router]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setTimeout(() => void refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [autoRefresh, delay, refresh]);

  const body = (
    <div aria-live="polite" className="space-y-2" role="status">
      <Notice>{getRunProgressMessage(progress, now)}</Notice>
      {autoRefresh ? (
        <p className="text-xs leading-5 text-[var(--atmosphere-muted)]">
          可以离开，系统会继续查票；回来打开本页即可查看进度。
        </p>
      ) : null}
      {progress.status === "incomplete" || progress.status === "failed" ? (
        <p className="text-xs leading-5 text-[var(--atmosphere-muted)]">
          诊断编号 {diagnosticRunId(progress.runId)}
        </p>
      ) : null}
      {restartMessage ? (
        <p className="text-xs leading-5 text-[var(--atmosphere-muted)]" role="alert">
          {restartMessage}
        </p>
      ) : null}
      <button
        className="atmosphere-ghost w-full rounded-xl py-3 text-sm font-medium"
        disabled={restarting}
        onClick={() => void (terminalFailure ? restart() : refresh())}
        type="button"
      >
        {terminalFailure
          ? restarting ? "正在重新查询" : "重新查询"
          : "刷新结果"}
      </button>
      {terminalFailure && code ? (
        <a
          className="block text-center text-xs leading-5 text-[var(--atmosphere-muted)] underline underline-offset-4"
          href={`/p/${encodeURIComponent(code)}`}
        >
          返回计划页
        </a>
      ) : null}
    </div>
  );

  if (!autoRefresh) {
    return body;
  }

  return (
    <PeakScenicAccent className="rounded-xl p-4">
      {body}
    </PeakScenicAccent>
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
      return "见面城市先保留着；有几位朋友的票价没查全，过一会再试一次";
    case "failed":
      if (progress.diagnosticCode === "RUN_STALE_EXPIRED") {
        return "查询暂停太久中断了。多半是后台服务停太久，点「重新查询」后再等一会儿。";
      }
      return "见面城市先保留着；真实票价这次没查完，稍后再试一次。如果反复失败，把下面这串编号发给发起人。";
    case "completed":
      return "选好了！去看看这次在哪儿见";
  }
}

export function isNonterminal(status: RunStatus) {
  return !["completed", "incomplete", "failed"].includes(status);
}

export function diagnosticRunId(runId: string) {
  const suffix = runId.replace(/^run[-_]?/i, "").slice(0, 8).toUpperCase();
  return `RUN-${suffix || runId.slice(0, 8).toUpperCase()}`;
}
