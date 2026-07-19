const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function calendarDateInShanghai(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function isCalendarDateOnOrAfter(
  value: string,
  minimumDate: string,
): boolean {
  return (
    CALENDAR_DATE_PATTERN.test(value) &&
    CALENDAR_DATE_PATTERN.test(minimumDate) &&
    value >= minimumDate
  );
}
