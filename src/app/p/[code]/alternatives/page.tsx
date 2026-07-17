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
      title="换个城市看看"
      description="先悄悄算一版只有你和发起人能看的方案，满意再让发起人替换给大家。"
      backHref={`/p/${code}/result`}
      backLabel="返回共享结果"
    >
      <AlternativeCityFlow code={code} initialPreview={null} initialRunId={runId} />
    </ResponsiveShell>
  );
}
