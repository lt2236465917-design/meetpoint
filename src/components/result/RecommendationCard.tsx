type Recommendation = {
  id: string;
  city_name: string;
  total_price_cny: number;
  avg_price_cny: number;
  labels: string[];
  explanation: string | null;
  risk_summary: string | null;
  estimate_penalty: number;
  transfer_penalty: number;
  waiting_penalty: number;
};

export function RecommendationCard({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  const badges = [
    recommendation.estimate_penalty > 0 ? "含估算" : null,
    recommendation.transfer_penalty > 0 ? "含中转" : null,
    recommendation.waiting_penalty > 0 ? "等待较久" : null,
  ].filter((badge): badge is string => Boolean(badge));

  return (
    <article className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-gray-950">
            {recommendation.city_name}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {recommendation.labels.join(" / ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold text-gray-950">
            ¥{recommendation.total_price_cny}
          </div>
          <div className="text-xs text-gray-500">
            人均 ¥{recommendation.avg_price_cny}
          </div>
        </div>
      </div>

      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {badges.map((badge) => (
            <span
              className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600"
              key={badge}
            >
              {badge}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-sm leading-6 text-gray-700">
        {recommendation.explanation ?? "请在购票前重新核对实时价格。"}
      </p>
      {recommendation.risk_summary && (
        <p className="mt-2 text-xs leading-5 text-gray-500">
          {recommendation.risk_summary}
        </p>
      )}
    </article>
  );
}
