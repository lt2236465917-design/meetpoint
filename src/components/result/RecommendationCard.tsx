import { transportModeLabels } from "@/lib/ui/transport-modes";
import type { TransportMode, TravelSource } from "@/types/domain";

type ParticipantOption = {
  participant_name: string;
  departure_city_name: string;
  mode: TransportMode;
  price_cny: number | null;
  duration_minutes: number | null;
  depart_at: string | null;
  arrive_at: string | null;
  booking_url: string | null;
  service_name: string | null;
  source: TravelSource;
};

type Recommendation = {
  id: string;
  city_name: string;
  total_price_cny: number;
  labels: string[];
  explanation: string | null;
  risk_summary: string | null;
  estimate_penalty: number;
  transfer_penalty: number;
  waiting_penalty: number;
  total_duration_minutes: number;
  fairness_gap: number;
  participant_options?: ParticipantOption[];
};

const labelCopy: Record<string, string> = {
  cheapest: "省钱优先",
  balanced: "综合最优",
  fastest: "省时优先",
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
  const labels = recommendation.labels.map(
    (label) => labelCopy[label] ?? label,
  );

  return (
    <article className="flex h-full flex-col rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold text-gray-950">
            {recommendation.city_name}
          </h3>
          <p className="mt-1 break-words text-sm text-gray-500">
            {labels.join(" / ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-semibold text-gray-950">
            团队总路费 ¥{recommendation.total_price_cny}
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

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
        <p className="rounded-lg bg-gray-50 px-2 py-2 font-medium text-gray-700">
          总耗时 {formatDuration(recommendation.total_duration_minutes)}
        </p>
        <p className="rounded-lg bg-gray-50 px-2 py-2 font-medium text-gray-700">
          公平差 ¥{recommendation.fairness_gap}
        </p>
      </div>

      <p className="mt-3 text-sm leading-6 text-gray-700">
        {recommendation.explanation ?? "请在购票前重新核对实时价格。"}
      </p>
      {recommendation.risk_summary && (
        <p className="mt-2 text-xs leading-5 text-gray-500">
          {recommendation.risk_summary}
        </p>
      )}
      {recommendation.participant_options?.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-gray-500">每人出行明细</p>
          {recommendation.participant_options.map((option) => (
            <div
              className="rounded-lg border border-gray-100 px-3 py-2 text-xs leading-5 text-gray-600"
              key={`${option.participant_name}-${option.departure_city_name}-${option.mode}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {option.participant_name}
                  </p>
                  <p>
                    {option.departure_city_name}出发 ·{" "}
                    {transportModeLabels[option.mode]}
                    {option.service_name ? ` · ${option.service_name}` : ""}
                  </p>
                </div>
                <p className="shrink-0 font-medium text-gray-900">
                  {formatPrice(option.price_cny)}
                </p>
              </div>
              <p className="mt-1">
                {formatTimeRange(option.depart_at, option.arrive_at)} ·{" "}
                {formatDuration(option.duration_minutes ?? 0)}
              </p>
              {option.booking_url && (
                <a
                  className="mt-1 inline-block font-medium text-gray-950 underline underline-offset-2"
                  href={option.booking_url}
                >
                  去购票
                </a>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {recommendation.estimate_penalty > 0 && (
        <p className="mt-2 text-xs leading-5 text-gray-500">
          估算价：价格来自距离和交通方式粗估，接入实时票务后会替换为真实报价。
        </p>
      )}
    </article>
  );
}

function formatPrice(value: number | null): string {
  return typeof value === "number" ? `¥${value}` : "暂无报价";
}

function formatTimeRange(departAt: string | null, arriveAt: string | null) {
  if (!departAt || !arriveAt) return "时间待确认";
  return `${formatClock(departAt)}-${formatClock(arriveAt)}`;
}

function formatClock(value: string): string {
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] ?? value;
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "暂无";
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours === 0) return `${restMinutes}分钟`;
  if (restMinutes === 0) return `${hours}小时`;
  return `${hours}小时${restMinutes}分钟`;
}
