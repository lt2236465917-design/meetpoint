import Link from "next/link";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { RecentMeetingRecords } from "@/components/plan/RecentMeetingRecords";

export default function HomePage() {
  return (
    <ResponsiveShell
      title="多人异地见面，先算去哪座城"
      description="收集每个人的出发城市和交通偏好，比较机票和高铁火车成本，生成省钱、均衡、省时三档建议。"
      aside={
        <p className="text-center text-xs leading-5 text-gray-500">
          创建计划后，把公开链接发给朋友；大家填完信息后再计算推荐城市。
        </p>
      }
    >
      <div className="space-y-5">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-950">开始一个计划</p>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            先创建计划，再把链接发给朋友填写。
          </p>
          <Link
            className="mt-5 block rounded-lg bg-black py-3 text-center font-medium text-white"
            href="/create"
          >
            创建见面计划
          </Link>
        </section>

        <RecentMeetingRecords />
      </div>
    </ResponsiveShell>
  );
}
