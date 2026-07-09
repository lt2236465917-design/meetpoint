"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { CandidateCityEditor } from "@/components/plan/CandidateCityEditor";
import { getApiErrorMessage } from "@/lib/ui/api-error-message";

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
          : getApiErrorMessage(json.error, "计算失败，请稍后重试"),
      );
    } catch {
      setMessage("计算失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ResponsiveShell
      title="管理计划"
      description="输入管理口令后，可以调整候选城市并手动计算。"
      aside={
        <Link
          className="block text-center text-xs font-medium text-gray-500"
          href={`/p/${code}`}
        >
          返回公开计划页
        </Link>
      }
    >
      <div className="space-y-5">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-medium text-gray-950">管理口令</h2>
          <input
            className="mt-4 w-full rounded-lg border px-4 py-3"
            placeholder="管理口令"
            value={managementToken}
            onChange={(event) => setManagementToken(event.target.value)}
          />

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
        </section>

        <section>
          {managementToken ? (
            <CandidateCityEditor code={code} managementToken={managementToken} />
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="font-medium text-gray-950">候选城市</h2>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                输入管理口令后，可以添加或排除候选城市。
              </p>
            </div>
          )}
        </section>
      </div>
    </ResponsiveShell>
  );
}
