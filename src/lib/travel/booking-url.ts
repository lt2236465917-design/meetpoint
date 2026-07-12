const APPROVED_BOOKING_HOSTS = ["fliggy.com", "alitrip.com"];

export function isApprovedBookingUrl(value: string | null): value is string {
  if (!value) return false;

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      APPROVED_BOOKING_HOSTS.some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}
