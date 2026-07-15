import type { ValidationDecision, VerifiedQuote } from "@/lib/agent/contracts";

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function arrivalDateInShanghai(timestamp: string): string | null {
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function validateArrivalDate(
  quote: Pick<VerifiedQuote, "arriveAt">,
  arrivalDate: string,
): ValidationDecision {
  return arrivalDateInShanghai(quote.arriveAt) === arrivalDate
    ? { ok: true }
    : { ok: false, codes: ["ARRIVAL_DATE_MISMATCH"] };
}
