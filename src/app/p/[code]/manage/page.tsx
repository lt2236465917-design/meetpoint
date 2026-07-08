"use client";

import { use, useState } from "react";
import { CandidateCityEditor } from "@/components/plan/CandidateCityEditor";

export default function ManagePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [managementToken, setManagementToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function calculate() {
    if (loading || !managementToken) return;

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/plans/${code}/calculate`, {
        method: "POST",
        headers: { "x-management-token": managementToken },
      });
      const json = await response.json().catch(() => ({}));
      setMessage(
        response.ok
          ? `计算完成：${json.candidateCount} 个候选城市`
          : json.error || "计算失败",
      );
    } catch {
      setMessage("计算失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-white px-5 py-6">
      <h1 className="text-2xl font-semibold text-gray-950">管理计划</h1>
      <p className="mt-2 text-sm leading-6 text-gray-500">
        输入管理口令后，可以调整候选城市并手动计算。
      </p>

      <input
        className="mt-6 w-full rounded-lg border px-4 py-3"
        placeholder="管理口令"
        value={managementToken}
        onChange={(event) => setManagementToken(event.target.value)}
      />

      {managementToken && (
        <div className="mt-4">
          <CandidateCityEditor code={code} managementToken={managementToken} />
        </div>
      )}

      <button
        className="mt-6 w-full rounded-lg bg-black py-3 font-medium text-white disabled:opacity-60"
        disabled={loading || !managementToken}
        onClick={calculate}
        type="button"
      >
        {loading ? "计算中" : "开始计算"}
      </button>

      {message && (
        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {message}
        </p>
      )}
    </main>
  );
}
