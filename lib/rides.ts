// Shared ride constants + types. Plain module (not "use server") so it can export
// non-async values, which a "use server" file cannot.
//
// The event's airport + UTC offset used to live here as hardcoded constants
// (single event → single airport/zone). They're now admin-registered on the
// `conferences` row (`airport_code`, `utc_offset`) — see lib/conference.ts —
// and passed in by callers instead.

export type Direction = "arrival" | "departure";

// Matching (lib/rideMatch.ts) only ever goes by time — flight number/airline/
// city were display-only in the old browse-and-join board and never used for
// it, so posting a flight is just "when" (+ a search window, collected
// alongside this — see app/actions/flights.ts's submitFlight). Was a fuller
// form at /rides/add; removed in favor of collecting both directions at
// onboarding + editing on Me.
export type FlightInput = {
  direction: Direction;
  localDateTime: string; // "2026-08-04T15:30" in event-airport wall-clock
};

// Stored instants are event-offset; render them back as the event's own
// wall-clock (IANA timezone) for a datetime-local input. Shared by Me's
// flight editor.
export function toLocalInput(iso: string, timezone = "America/New_York"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}
