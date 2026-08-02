import type { BaselineRecommendation as BaselineResult } from "@/lib/recommendation/baseline";
import { PeakScenicAccent } from "@/components/result/PeakScenicAccent";

export function BaselineRecommendation({ result }: { result: BaselineResult }) {
  return (
    <PeakScenicAccent className="rounded-xl p-5">
      <p className="readable-body text-xs text-white/85">先在这里见</p>
      <h2 className="readable-title mt-1 font-display text-2xl font-semibold text-white">
        {result.cityName}
      </h2>
      <p className="readable-body mt-3 text-sm leading-6 text-white/90">
        这是按大家出发位置和交通枢纽选出的基础建议。真实票价还在确认，暂不判断哪条路线更省钱或更省时。
      </p>
    </PeakScenicAccent>
  );
}
