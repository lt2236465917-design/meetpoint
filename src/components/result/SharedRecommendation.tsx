import { SchemeCard, type SharedScheme } from "./SchemeCard";

export type SharedResult = {
  id: string;
  cityCode: string;
  cityName: string;
  explanationZh: string;
  publishedAt: string;
  schemes: SharedScheme[];
};

export function SharedRecommendation({ result }: { result: SharedResult }) {
  const saving = result.schemes.find((scheme) => scheme.kind === "saving");
  const fast = result.schemes.find((scheme) => scheme.kind === "fast");

  if (!saving || !fast) return null;

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gray-950 p-5 text-white shadow-sm">
        <p className="text-xs text-gray-300">推荐见面城市</p>
        <h2 className="mt-1 text-2xl font-semibold">{result.cityName}</h2>
        <p className="mt-3 text-sm leading-6 text-gray-200">
          {result.explanationZh}
        </p>
      </div>
      <SchemeCard scheme={saving} />
      <SchemeCard scheme={fast} />
    </section>
  );
}
