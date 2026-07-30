import { describe, it, expect } from "vitest";
import { conferenceDayStatus } from "./conferenceDay";

const conf = {
  starts_at: "2026-08-05T13:00:00Z", // Aug 5, 9am EDT
  ends_at: "2026-08-08T13:00:00Z", // Aug 8, 9am EDT
  timezone: "America/New_York",
};

describe("conferenceDayStatus", () => {
  it("is 'no-conference' when nothing's registered yet", () => {
    expect(conferenceDayStatus(null, "2026-08-06T12:00:00Z")).toEqual({ kind: "no-conference" });
  });

  it("is day 1 on the start date itself", () => {
    expect(conferenceDayStatus(conf, "2026-08-05T20:00:00Z")).toEqual({
      kind: "during",
      day: 1,
      totalDays: 4,
    });
  });

  it("counts up on later days", () => {
    expect(conferenceDayStatus(conf, "2026-08-06T20:00:00Z")).toEqual({
      kind: "during",
      day: 2,
      totalDays: 4,
    });
  });

  it("is day 4 (the last day) on the end date", () => {
    expect(conferenceDayStatus(conf, "2026-08-08T15:00:00Z")).toEqual({
      kind: "during",
      day: 4,
      totalDays: 4,
    });
  });

  it("is 'before' with a countdown ahead of the start date", () => {
    expect(conferenceDayStatus(conf, "2026-08-02T20:00:00Z")).toEqual({
      kind: "before",
      daysUntil: 3,
    });
  });

  it("is 'before' with daysUntil 1 the day before it starts", () => {
    expect(conferenceDayStatus(conf, "2026-08-04T20:00:00Z")).toEqual({
      kind: "before",
      daysUntil: 1,
    });
  });

  it("is 'after' once the last day has passed", () => {
    expect(conferenceDayStatus(conf, "2026-08-09T20:00:00Z")).toEqual({ kind: "after" });
  });

  it("uses the conference's own timezone for day boundaries, not UTC", () => {
    // 2026-08-05T02:00:00Z is still Aug 4 in America/New_York (EDT, UTC-4) —
    // should read as "before", not day 1, if UTC boundaries were used by mistake.
    expect(conferenceDayStatus(conf, "2026-08-05T02:00:00Z")).toEqual({
      kind: "before",
      daysUntil: 1,
    });
  });

  it("a single-day conference is just day 1 of 1", () => {
    const oneDay = { starts_at: "2026-08-05T13:00:00Z", ends_at: "2026-08-05T22:00:00Z", timezone: "America/New_York" };
    expect(conferenceDayStatus(oneDay, "2026-08-05T18:00:00Z")).toEqual({
      kind: "during",
      day: 1,
      totalDays: 1,
    });
  });
});
