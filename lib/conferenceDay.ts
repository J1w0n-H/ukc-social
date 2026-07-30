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

// "Day 2 of 4 · UKC 2026" / "D-3 to UKC 2026" / "UKC 2026 has wrapped".
// null for "no-conference" — callers decide their own fallback (Home's
// header falls back to a plain date; the global top bar just hides itself).
export function formatConferenceDay(status: ConferenceDayStatus, conferenceName: string): string | null {
  switch (status.kind) {
    case "no-conference":
      return null;
    case "before":
      return `D-${status.daysUntil} to ${conferenceName}`;
    case "during":
      return `Day ${status.day} of ${status.totalDays} · ${conferenceName}`;
    case "after":
      return `${conferenceName} has wrapped`;
  }
}
