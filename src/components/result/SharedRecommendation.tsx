import { PeakScenicAccent } from "@/components/result/PeakScenicAccent";
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
      <PeakScenicAccent className="rounded-xl p-5">
        <p className="readable-body text-xs text-white/85">这次的见面城市</p>
        <h2 className="readable-title mt-1 font-display text-2xl font-semibold text-white">
          {result.cityName}
        </h2>
        <p className="readable-body mt-3 text-sm leading-6 text-white/90">
          {result.explanationZh}
        </p>
      </PeakScenicAccent>
      <SchemeCard scheme={saving} />
      <SchemeCard scheme={fast} />
    </section>
  );
}
