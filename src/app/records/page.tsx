import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { RecentMeetingRecords } from "@/components/plan/RecentMeetingRecords";

export default function RecordsPage() {
  return (
    <ResponsiveShell
      scenic
      title="最近见面记录"
      description="本机保存的见面计划，方便你接着填或把链接再丢进群里。"
      backHref="/"
      backLabel="返回首页"
    >
      <RecentMeetingRecords showHeading={false} />
    </ResponsiveShell>
  );
}
