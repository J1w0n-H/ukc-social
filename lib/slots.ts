// Derives the conference's meal slots straight from its registered dates —
// no separate admin UI to hand-enter slot times, and no fixed venue baked
// in (area is left blank; where to actually eat is up to attendees, same
// reasoning that already dropped the LLM's "suggested place" — see
// lib/matching.ts). One dinner each evening except the last day (people are
// usually gone by dinner on departure day), plus a farewell lunch on the
// last day. A single-day conference just gets one dinner.

export type SlotDraft = {
  title: string;
  starts_at: string;
  area: string;
  join_deadline: string;
  kind: "meal";
};

const DAY_MS = 86_400_000;
const DINNER_HOUR = "19:00";
const DINNER_DEADLINE_HOUR = "17:00";
const LUNCH_HOUR = "12:30";
const LUNCH_DEADLINE_HOUR = "10:30";

function dateOnly(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso));
}

// Same trick used elsewhere for admin-set wall-clock times (see migration
// 0012's utc_offset comment): a fixed offset, not DST-computed.
function toInstant(dateStr: string, hhmm: string, utcOffset: string): string {
  return new Date(`${dateStr}T${hhmm}:00${utcOffset}`).toISOString();
}

export function deriveSlots(conference: {
  starts_at: string;
  ends_at: string;
  timezone: string;
  utc_offset: string;
}): SlotDraft[] {
  const startDate = dateOnly(conference.starts_at, conference.timezone);
  const endDate = dateOnly(conference.ends_at, conference.timezone);

  const days: string[] = [];
  const endMs = new Date(`${endDate}T00:00:00Z`).getTime();
  for (
    let d = new Date(`${startDate}T00:00:00Z`);
    d.getTime() <= endMs;
    d = new Date(d.getTime() + DAY_MS)
  ) {
    days.push(d.toISOString().slice(0, 10));
  }
  if (days.length === 0) return [];

  const slots: SlotDraft[] = [];
  const dinnerDays = days.length === 1 ? days : days.slice(0, -1);
  dinnerDays.forEach((day, i) => {
    slots.push({
      title: `Day ${i + 1} Dinner`,
      starts_at: toInstant(day, DINNER_HOUR, conference.utc_offset),
      area: "",
      join_deadline: toInstant(day, DINNER_DEADLINE_HOUR, conference.utc_offset),
      kind: "meal",
    });
  });
  if (days.length > 1) {
    const lastDay = days[days.length - 1];
    slots.push({
      title: "Farewell Lunch",
      starts_at: toInstant(lastDay, LUNCH_HOUR, conference.utc_offset),
      area: "",
      join_deadline: toInstant(lastDay, LUNCH_DEADLINE_HOUR, conference.utc_offset),
      kind: "meal",
    });
  }
  return slots;
}
