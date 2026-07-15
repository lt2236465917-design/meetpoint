import { transportModeLabels } from "@/lib/ui/transport-modes";
import type { TransportMode } from "@/types/domain";

export type SharedSchemeRoute = {
  participantId: string;
  participantName: string;
  departureCityName: string;
  quoteId: string;
  mode: TransportMode;
  provider: string;
  queriedAt: string;
  priceCny: number;
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  transferCount: number;
  serviceName: string;
  departureStationName: string | null;
  arrivalStationName: string | null;
};

export type SharedScheme = {
  id: string;
  kind: "saving" | "fast";
  totalFareCny: number;
  totalDurationMinutes: number;
  latestArrivalAt: string;
  teamTransferCount: number;
  routes: SharedSchemeRoute[];
};

export function SchemeCard({ scheme }: { scheme: SharedScheme }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-950">
            {scheme.kind === "saving" ? "省钱方案" : "省时方案"}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            最晚到达 {formatChinaDateTime(scheme.latestArrivalAt)}
          </p>
        </div>
        <p className="shrink-0 font-semibold text-gray-950">
          团队总路费 ¥{scheme.totalFareCny}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-700">
        <p className="rounded-lg bg-gray-50 px-2 py-2">
          团队总耗时 {formatDuration(scheme.totalDurationMinutes)}
        </p>
        <p className="rounded-lg bg-gray-50 px-2 py-2">
          全员中转 {scheme.teamTransferCount} 次
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {scheme.routes.map((route) => (
          <div
            className="rounded-lg border border-gray-100 px-3 py-3 text-xs leading-5 text-gray-600"
            key={`${scheme.id}-${route.participantId}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-950">{route.participantName}</p>
                <p>{formatRoute(route)}</p>
                <p>
                  {transportModeLabels[route.mode]} · {route.serviceName}
                </p>
              </div>
              <p className="shrink-0 font-medium text-gray-950">¥{route.priceCny}</p>
            </div>
            <p className="mt-1">
              {formatClock(route.departAt)}–{formatClock(route.arriveAt)} ·{" "}
              {formatDuration(route.durationMinutes)} · 中转 {route.transferCount} 次
            </p>
            <p className="mt-1 text-gray-500">
              {providerLabel(route.provider)} · 报价 {quoteFingerprint(route.quoteId)} · 查询于{" "}
              {formatChinaDateTime(route.queriedAt)}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}

function formatRoute(route: SharedSchemeRoute) {
  if (route.departureStationName && route.arrivalStationName) {
    return `${route.departureStationName} → ${route.arrivalStationName}`;
  }
  if (route.departureStationName) return `${route.departureStationName}出发`;
  return `${route.departureCityName}出发`;
}

function providerLabel(provider: string) {
  return provider === "flyai" ? "飞猪" : provider;
}

function quoteFingerprint(quoteId: string) {
  return quoteId.length <= 8 ? quoteId : quoteId.slice(0, 8);
}

function formatClock(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatChinaDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}分钟`;
  if (rest === 0) return `${hours}小时`;
  return `${hours}小时${rest}分钟`;
}
