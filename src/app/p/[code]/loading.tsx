import { ResponsiveShell } from "@/components/layout/ResponsiveShell";

export default function PlanLoading() {
  return (
    <ResponsiveShell
      title="正在打开计划"
      description="正在取回这次见面的最新进度…"
      backHref="/records"
      backLabel="返回最近记录"
    >
      <div
        aria-label="计划加载中"
        className="atmosphere-panel animate-pulse rounded-xl p-5"
        role="status"
      >
        <div className="h-4 w-32 rounded-full bg-white/20" />
        <div className="mt-4 h-3 w-full rounded-full bg-white/10" />
        <div className="mt-2 h-3 w-2/3 rounded-full bg-white/10" />
      </div>
    </ResponsiveShell>
  );
}
