import { describe, it, expect } from "vitest";
import { findBestPool, averagePickupAt, canCancelFlight, type CandidatePool } from "./rideMatch";

const pool = (over: Partial<CandidatePool>): CandidatePool => ({
  id: "p1",
  pickupAt: "2026-08-05T18:00:00Z",
  memberCount: 1,
  capacity: 4,
  ...over,
});

describe("findBestPool", () => {
  it("finds a pool within the window", () => {
    const best = findBestPool([pool({ pickupAt: "2026-08-05T18:30:00Z" })], "2026-08-05T18:00:00Z", 2);
    expect(best?.id).toBe("p1");
  });

  it("is null when nothing is within the window", () => {
    const best = findBestPool([pool({ pickupAt: "2026-08-05T22:00:00Z" })], "2026-08-05T18:00:00Z", 1);
    expect(best).toBeNull();
  });

  it("is null when every candidate is at capacity", () => {
    const best = findBestPool(
      [pool({ pickupAt: "2026-08-05T18:00:00Z", memberCount: 4, capacity: 4 })],
      "2026-08-05T18:00:00Z",
      2,
    );
    expect(best).toBeNull();
  });

  it("picks the closest pool in time among several qualifying ones", () => {
    const best = findBestPool(
      [
        pool({ id: "far", pickupAt: "2026-08-05T19:30:00Z" }),
        pool({ id: "close", pickupAt: "2026-08-05T18:15:00Z" }),
      ],
      "2026-08-05T18:00:00Z",
      2,
    );
    expect(best?.id).toBe("close");
  });

  it("is inclusive at exactly the window boundary", () => {
    const best = findBestPool([pool({ pickupAt: "2026-08-05T20:00:00Z" })], "2026-08-05T18:00:00Z", 2);
    expect(best?.id).toBe("p1");
  });

  it("is null with no candidate pools", () => {
    expect(findBestPool([], "2026-08-05T18:00:00Z", 2)).toBeNull();
  });
});

describe("averagePickupAt", () => {
  it("averages two flight times", () => {
    const avg = averagePickupAt(["2026-08-05T18:00:00Z", "2026-08-05T19:00:00Z"]);
    expect(avg).toBe("2026-08-05T18:30:00.000Z");
  });

  it("is the same instant for a single flight time", () => {
    expect(averagePickupAt(["2026-08-05T18:00:00Z"])).toBe("2026-08-05T18:00:00.000Z");
  });

  it("throws on an empty list rather than returning a nonsense average", () => {
    expect(() => averagePickupAt([])).toThrow();
  });
});

describe("canCancelFlight", () => {
  const tz = "America/New_York";

  it("is true the day before the flight", () => {
    expect(canCancelFlight("2026-08-06T15:00:00Z", tz, "2026-08-05T15:00:00Z")).toBe(true);
  });

  it("is false once the flight's own day has started", () => {
    // 2026-08-06T02:00:00Z is already Aug 5 10pm EDT the night before... but
    // 2026-08-06T15:00:00Z (11am EDT) is same-day as an evening flight.
    expect(canCancelFlight("2026-08-06T23:00:00Z", tz, "2026-08-06T15:00:00Z")).toBe(false);
  });

  it("is false after the flight has already departed", () => {
    expect(canCancelFlight("2026-08-06T15:00:00Z", tz, "2026-08-07T15:00:00Z")).toBe(false);
  });

  it("uses the conference's own timezone, not UTC, for the day boundary", () => {
    // 2026-08-06T02:00:00Z is still Aug 5, 10pm EDT — the night before an
    // Aug 6 flight, so cancellation should still be allowed.
    expect(canCancelFlight("2026-08-06T15:00:00Z", tz, "2026-08-06T02:00:00Z")).toBe(true);
  });
});
