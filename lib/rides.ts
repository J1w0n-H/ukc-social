// Shared ride constants + types. Plain module (not "use server") so it can export
// non-async values, which a "use server" file cannot.

// The event's shared airport. Single event → single airport (Orlando, UKC 2026).
export const EVENT_AIRPORT = "MCO";
// Orlando is EDT (-04:00) across the Aug arrival window. datetime-local inputs are
// wall-clock with no zone, so we pin them to the event's offset when storing.
export const EVENT_OFFSET = "-04:00";

export type Direction = "arrival" | "departure";

// Matching (Board.tsx) only ever buckets by time — flight number/airline/city
// were display-only and never used for it, so posting a flight is just
// "when." (Was a fuller form at /rides/add; removed in favor of collecting
// both directions at onboarding + editing on Me.)
export type FlightInput = {
  direction: Direction;
  localDateTime: string; // "2026-08-04T15:30" in event-airport wall-clock
};

// Stored instants are event-offset; render them back as MCO wall-clock for a
// datetime-local input. Shared by Me's flight editor.
export function toLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
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
