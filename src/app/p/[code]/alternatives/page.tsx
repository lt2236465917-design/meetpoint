import { ResponsiveShell } from "@/components/layout/ResponsiveShell";
import { AlternativeCityFlow } from "@/components/result/AlternativeCityFlow";

export default async function AlternativesPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ runId?: string | string[] }>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const runId = typeof query.runId === "string" ? query.runId : "";
  return (
    <ResponsiveShell
      title="替代城市预览"
      description="先私下比较真实出行方案，再由发起人决定是否替换。"
      backHref={`/p/${code}/result`}
      backLabel="返回共享结果"
    >
      <AlternativeCityFlow code={code} initialPreview={null} initialRunId={runId} />
    </ResponsiveShell>
  );
}
