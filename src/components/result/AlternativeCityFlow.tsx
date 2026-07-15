"use client";

import { useCallback, useEffect, useState } from "react";

import { CityCombobox } from "@/components/forms/CityCombobox";
import { RefreshingResultNotice } from "@/components/result/RefreshingResultNotice";
import { SharedRecommendation } from "@/components/result/SharedRecommendation";
import { Notice } from "@/components/ui/Notice";
import type { AlternativePreviewData } from "@/lib/recommendation/alternative-preview";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";
import { readMeetingHistory } from "@/lib/ui/meeting-history";

const ACTIVE_STATUSES = new Set(["pending", "collecting", "cooling_down", "calculating", "validating"]);

export function AlternativeCityFlow({
  code,
  participantToken: participantTokenProp = "",
  hostToken: hostTokenProp = "",
  initialPreview,
  initialRunId = "",
}: {
  code: string;
  participantToken?: string;
  hostToken?: string;
  initialPreview: AlternativePreviewData | null;
  initialRunId?: string;
}) {
  const [city, setCity] = useState<{ code: string; name: string } | null>(null);
  const [participantToken, setParticipantToken] = useState(participantTokenProp);
  const [hostToken, setHostToken] = useState(hostTokenProp);
  const [preview, setPreview] = useState(initialPreview);
  const [runId, setRunId] = useState(initialPreview?.runId ?? initialRunId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const record = readMeetingHistory().find((item) => item.code === code);
      setParticipantToken((value) => value || record?.participantEditToken || "");
      setHostToken((value) => value || record?.hostToken || "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [code]);

  const readPreview = useCallback(async (targetRunId: string) => {
    const headers: Record<string, string> = {};
    if (participantToken) headers["x-participant-token"] = participantToken;
    if (hostToken) headers["x-host-token"] = hostToken;
    const response = await fetch(`/api/plans/${code}/previews/${targetRunId}`, {
      headers,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const next = await response.json() as AlternativePreviewData;
    setPreview(next);
    return next;
  }, [code, hostToken, participantToken]);

  useEffect(() => {
    if (!runId || (!participantToken && !hostToken)) return;
    const timer = window.setTimeout(() => void readPreview(runId), 0);
    return () => window.clearTimeout(timer);
  }, [hostToken, participantToken, readPreview, runId]);

  useEffect(() => {
    if (!runId || !participantToken || !preview || !ACTIVE_STATUSES.has(preview.status)) return;
    const timer = window.setTimeout(async () => {
      await fetch(`/api/plans/${code}/runs/${runId}/advance`, {
        method: "POST",
        headers: { "x-participant-token": participantToken },
      }).catch(() => null);
      await readPreview(runId).catch(() => null);
    }, 2_000);
    return () => window.clearTimeout(timer);
  }, [code, participantToken, preview, readPreview, runId]);

  async function createPreview() {
    if (!city || !participantToken || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/plans/${code}/previews`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-participant-token": participantToken },
        body: JSON.stringify({ cityCode: city.code, cityName: city.name }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(getApiErrorMessage(json.error, "无法生成预览，请稍后重试"));
        return;
      }
      const nextRunId = json.runId as string;
      setRunId(nextRunId);
      setPreview({ runId: nextRunId, status: "pending", pendingGroups: 0, result: null });
      window.history.replaceState(null, "", `/p/${code}/alternatives?runId=${encodeURIComponent(nextRunId)}`);
      setMessage("正在查询这个城市的真实票价。");
    } catch {
      setMessage("无法生成预览，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function confirmReplacement() {
    if (!runId || !hostToken || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/plans/${code}/previews/${runId}/confirm`, {
        method: "POST",
        headers: { "x-host-token": hostToken },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(getApiErrorMessage(json.error, "确认失败，请稍后重试"));
        return;
      }
      setPreview((value) => value ? { ...value, status: "completed" } : value);
      setMessage("已替换共享结果，所有人现在看到这个城市。");
    } catch {
      setMessage("确认失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium text-gray-500">仅你可见的预览</p>
        <h2 className="mt-1 text-lg font-semibold text-gray-950">换个城市看看</h2>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          先核算真实票价，不会立刻改变大家看到的结果。
        </p>
        <div className="mt-4 space-y-3">
          <CityCombobox value={city} onChange={setCity} label="替代城市" placeholder="搜索想去的城市" />
          <button
            className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-50"
            disabled={!city || !participantToken || busy}
            onClick={createPreview}
            type="button"
          >
            {busy ? "处理中" : "生成私有预览"}
          </button>
          {!participantToken ? <Notice>请在填写过这份计划的浏览器中打开。</Notice> : null}
        </div>
      </section>

      {preview && ACTIVE_STATUSES.has(preview.status) ? (
        <RefreshingResultNotice progress={{
          runId: preview.runId,
          status: preview.status,
          traceId: preview.traceId ?? preview.runId,
          pendingGroups: preview.pendingGroups ?? 0,
          retryAt: preview.retryAt ?? null,
          diagnosticCode: preview.diagnosticCode ?? null,
        }} />
      ) : null}
      {preview?.result ? <SharedRecommendation result={preview.result} /> : null}

      {hostToken && preview?.status === "awaiting_host_confirmation" ? (
        <button
          className="w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-50"
          disabled={busy}
          onClick={confirmReplacement}
          type="button"
        >
          确认替换共享结果
        </button>
      ) : (
        <Notice>请发起人确认替换</Notice>
      )}
      {message ? <p aria-live="polite" className="text-sm leading-6 text-gray-600">{message}</p> : null}
    </div>
  );
}
