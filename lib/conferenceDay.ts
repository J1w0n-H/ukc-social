// "Which day of the conference is it" for Home's header — replaces a plain
// calendar date, which said nothing about where you are in the event. Pure
// date math (kind-based result, not a formatted string) so callers pick the
// copy and this stays unit-testable.

const DAY_MS = 86_400_000;

export type ConferenceDayStatus =
  | { kind: "no-conference" }
  | { kind: "before"; daysUntil: number }
  | { kind: "during"; day: number; totalDays: number }
  | { kind: "after" };

function dateAnchor(iso: string, timezone: string): number {
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso));
  return new Date(`${dateStr}T00:00:00Z`).getTime();
}

export function conferenceDayStatus(
  conference: { starts_at: string; ends_at: string; timezone: string } | null,
  nowIso: string,
): ConferenceDayStatus {
  if (!conference) return { kind: "no-conference" };

  const startAnchor = dateAnchor(conference.starts_at, conference.timezone);
  const endAnchor = dateAnchor(conference.ends_at, conference.timezone);
  const todayAnchor = dateAnchor(nowIso, conference.timezone);

  const day = Math.round((todayAnchor - startAnchor) / DAY_MS) + 1;
  const totalDays = Math.round((endAnchor - startAnchor) / DAY_MS) + 1;

  if (day < 1) return { kind: "before", daysUntil: 1 - day };
  if (day > totalDays) return { kind: "after" };
  return { kind: "during", day, totalDays };
}
