// Groups flat schedule_items rows into days -> time slots -> parallel items,
// for 홈's agenda view. Rows aren't stored pre-nested (see migration 0016) —
// several rows can legitimately share the same starts_at/ends_at (parallel
// tracks), and this is the one place that reassembles that structure. Pure
// grouping/sorting logic only — display formatting (weekday/time strings,
// in the conference's timezone) stays in the caller, same split as
// lib/slots.ts.

export type ScheduleItem = {
  id: string;
  starts_at: string;
  ends_at: string;
  title: string;
  sort_order: number;
};

export type ScheduleSlot = {
  starts_at: string;
  ends_at: string;
  items: ScheduleItem[];
};

export type ScheduleDay = {
  date: string; // YYYY-MM-DD in the conference's timezone
  slots: ScheduleSlot[];
};

export function groupScheduleByDay(items: ScheduleItem[], timezone: string): ScheduleDay[] {
  const dateOnly = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso));

  const sorted = [...items].sort((a, b) => {
    const byStart = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    return byStart !== 0 ? byStart : a.sort_order - b.sort_order;
  });

  const dayMap = new Map<string, Map<string, ScheduleSlot>>();
  for (const item of sorted) {
    const date = dateOnly(item.starts_at);
    const slotKey = `${item.starts_at}|${item.ends_at}`;
    if (!dayMap.has(date)) dayMap.set(date, new Map());
    const slots = dayMap.get(date)!;
    if (!slots.has(slotKey)) {
      slots.set(slotKey, { starts_at: item.starts_at, ends_at: item.ends_at, items: [] });
    }
    slots.get(slotKey)!.items.push(item);
  }

  return [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({ date, slots: [...slots.values()] }));
}
