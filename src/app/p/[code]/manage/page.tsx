"use client";

import Link from "next/link";
import { use } from "react";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";

export default function ManagePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);

  return (
    <ResponsiveShell
      title="管理计划"
      description="这个入口已合并到公开计划页。"
      backHref={`/p/${code}`}
      backLabel="返回计划页"
    >
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-medium text-gray-950">去计划页继续</h2>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          参与人数填满后，已填写过这份计划的人可以直接在计划页开始计算。
        </p>
        <Link
          className="mt-4 block rounded-lg bg-black py-3 text-center font-medium text-white"
          href={`/p/${code}`}
        >
          返回计划页
        </Link>
      </section>
    </ResponsiveShell>
  );
}
