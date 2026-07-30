import { describe, it, expect } from "vitest";
import { groupScheduleByDay, type ScheduleItem } from "./schedule";

const item = (over: Partial<ScheduleItem>): ScheduleItem => ({
  id: "id",
  starts_at: "2026-08-06T12:00:00Z",
  ends_at: "2026-08-06T14:00:00Z",
  title: "Session",
  sort_order: 0,
  ...over,
});

describe("groupScheduleByDay", () => {
  it("groups items sharing the same start/end time into one slot", () => {
    const days = groupScheduleByDay(
      [
        item({ id: "a", title: "KSEA Forums", sort_order: 0 }),
        item({ id: "b", title: "IES opening", sort_order: 1 }),
      ],
      "America/New_York",
    );
    expect(days).toHaveLength(1);
    expect(days[0].slots).toHaveLength(1);
    expect(days[0].slots[0].items.map((i) => i.title)).toEqual(["KSEA Forums", "IES opening"]);
  });

  it("orders parallel items in a slot by sort_order, not insertion order", () => {
    const days = groupScheduleByDay(
      [
        item({ id: "a", title: "Second", sort_order: 1 }),
        item({ id: "b", title: "First", sort_order: 0 }),
      ],
      "America/New_York",
    );
    expect(days[0].slots[0].items.map((i) => i.title)).toEqual(["First", "Second"]);
  });

  it("separates items with different times into separate slots, in chronological order", () => {
    const days = groupScheduleByDay(
      [
        item({ id: "a", title: "Lunch", starts_at: "2026-08-06T16:00:00Z", ends_at: "2026-08-06T17:00:00Z" }),
        item({ id: "b", title: "Breakfast", starts_at: "2026-08-06T11:00:00Z", ends_at: "2026-08-06T12:00:00Z" }),
      ],
      "America/New_York",
    );
    expect(days).toHaveLength(1);
    expect(days[0].slots.map((s) => s.items[0].title)).toEqual(["Breakfast", "Lunch"]);
  });

  it("groups by the conference's own timezone, not UTC", () => {
    // 2026-08-07T02:00:00Z is Aug 6 10pm EDT — should land on Aug 6, not Aug 7.
    const days = groupScheduleByDay(
      [item({ starts_at: "2026-08-07T02:00:00Z", ends_at: "2026-08-07T04:00:00Z" })],
      "America/New_York",
    );
    expect(days[0].date).toBe("2026-08-06");
  });

  it("sorts days chronologically", () => {
    const days = groupScheduleByDay(
      [
        item({ starts_at: "2026-08-08T12:00:00Z", ends_at: "2026-08-08T13:00:00Z" }),
        item({ starts_at: "2026-08-05T12:00:00Z", ends_at: "2026-08-05T13:00:00Z" }),
      ],
      "America/New_York",
    );
    expect(days.map((d) => d.date)).toEqual(["2026-08-05", "2026-08-08"]);
  });

  it("returns an empty array for no items", () => {
    expect(groupScheduleByDay([], "America/New_York")).toEqual([]);
  });
});
