import Link from "next/link";
import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { RecentMeetingRecords } from "@/components/plan/RecentMeetingRecords";

export default function HomePage() {
  return (
    <ResponsiveShell
      title="散在几座城的朋友，这次在哪儿见？"
      description="每个人填一座出发城市，我们查遍真实机票和火车票，为全员选出一座见面城市——省钱一套走法，省时一套走法。"
      aside={
        <p className="text-center text-xs leading-5 text-gray-500">
          建好计划把链接丢进群里，人齐了就能一键开算。
        </p>
      }
    >
      <div className="space-y-5">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-950">发起这场见面</p>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            一分钟建好，链接发到群里等大家来填。
          </p>
          <Link
            className="mt-5 block rounded-lg bg-black py-3 text-center font-medium text-white"
            href="/create"
          >
            发起见面计划
          </Link>
        </section>

        <RecentMeetingRecords />
      </div>
    </ResponsiveShell>
  );
}
