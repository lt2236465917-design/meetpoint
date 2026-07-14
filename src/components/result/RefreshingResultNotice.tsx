"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui/Notice";

const MAX_AUTO_REFRESHES = 10;

export function RefreshingResultNotice() {
  const router = useRouter();
  const [refreshCount, setRefreshCount] = useState(0);
  const canAutoRefresh = refreshCount < MAX_AUTO_REFRESHES;

  useEffect(() => {
    if (!canAutoRefresh) return;

    const refreshTimer = window.setTimeout(() => {
      setRefreshCount((count) => count + 1);
      router.refresh();
    }, 3000);

    return () => window.clearTimeout(refreshTimer);
  }, [canAutoRefresh, router]);

  return (
    <div aria-live="polite" className="space-y-2" role="status">
      <Notice>
        {canAutoRefresh
          ? "正在查询票价并生成结果，请稍后自动刷新。"
          : "结果仍在生成，请点击刷新结果查看最新状态。"}
      </Notice>
      <button
        className="w-full rounded-lg border border-gray-200 py-3 text-sm font-medium text-gray-950"
        onClick={() => router.refresh()}
        type="button"
      >
        刷新结果
      </button>
    </div>
  );
}
