import { describe, it, expect } from "vitest";
import { deriveSlots } from "./slots";

const conf = (over: Partial<Parameters<typeof deriveSlots>[0]> = {}) => ({
  starts_at: "2026-08-05T13:00:00Z",
  ends_at: "2026-08-08T13:00:00Z",
  timezone: "America/New_York",
  utc_offset: "-04:00",
  ...over,
});

describe("deriveSlots", () => {
  it("makes one dinner per day except the last, plus a farewell lunch on the last day", () => {
    const slots = deriveSlots(conf());
    expect(slots.map((s) => s.title)).toEqual([
      "Day 1 Dinner",
      "Day 2 Dinner",
      "Day 3 Dinner",
      "Farewell Lunch",
    ]);
  });

  it("no area on any derived slot — no fixed venue to bake in", () => {
    for (const s of deriveSlots(conf())) expect(s.area).toBe("");
  });

  it("dinner starts at 7pm local, join deadline 2h before, using the conference's utc_offset", () => {
    const [dinner1] = deriveSlots(conf());
    expect(dinner1.starts_at).toBe("2026-08-05T23:00:00.000Z"); // 19:00 EDT (-04:00)
    expect(dinner1.join_deadline).toBe("2026-08-05T21:00:00.000Z"); // 17:00 EDT
  });

  it("farewell lunch starts at 12:30pm local, join deadline 2h before", () => {
    const slots = deriveSlots(conf());
    const lunch = slots[slots.length - 1];
    expect(lunch.starts_at).toBe("2026-08-08T16:30:00.000Z"); // 12:30 EDT
    expect(lunch.join_deadline).toBe("2026-08-08T14:30:00.000Z"); // 10:30 EDT
  });

  it("a single-day conference gets just one dinner, no separate farewell lunch", () => {
    const slots = deriveSlots(conf({ starts_at: "2026-08-05T13:00:00Z", ends_at: "2026-08-05T20:00:00Z" }));
    expect(slots.map((s) => s.title)).toEqual(["Day 1 Dinner"]);
  });

  it("a two-day conference gets one dinner (day 1) and a farewell lunch (day 2)", () => {
    const slots = deriveSlots(conf({ starts_at: "2026-08-05T13:00:00Z", ends_at: "2026-08-06T13:00:00Z" }));
    expect(slots.map((s) => s.title)).toEqual(["Day 1 Dinner", "Farewell Lunch"]);
  });

  it("respects a non-UTC timezone/offset (Pacific)", () => {
    const slots = deriveSlots(
      conf({
        starts_at: "2026-08-05T20:00:00Z", // still Aug 5 in PT (13:00 PT)
        ends_at: "2026-08-06T20:00:00Z",
        timezone: "America/Los_Angeles",
        utc_offset: "-07:00",
      }),
    );
    expect(slots[0].starts_at).toBe("2026-08-06T02:00:00.000Z"); // 19:00 PDT
  });

  it("is idempotent in shape when called again with the same conference", () => {
    const a = deriveSlots(conf());
    const b = deriveSlots(conf());
    expect(a).toEqual(b);
  });
});
