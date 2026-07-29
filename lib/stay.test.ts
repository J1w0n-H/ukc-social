import { describe, it, expect } from "vitest";
import { stayRelation } from "./stay";

const viewer = { start: "2026-08-05", end: "2026-08-08" };

describe("stayRelation", () => {
  it("returns null when either side's dates are unset", () => {
    expect(stayRelation({ start: null, end: null }, viewer)).toBeNull();
    expect(stayRelation({ start: "2026-08-05", end: "2026-08-08" }, { start: null, end: null })).toBeNull();
  });

  it("flags no-overlap when the ranges don't touch", () => {
    expect(stayRelation({ start: "2026-08-01", end: "2026-08-03" }, viewer)).toBe("no-overlap");
  });

  it("flags early when the person's stay starts before the viewer's", () => {
    expect(stayRelation({ start: "2026-08-03", end: "2026-08-08" }, viewer)).toBe("early");
  });

  it("flags late when the person's stay ends after the viewer's", () => {
    expect(stayRelation({ start: "2026-08-05", end: "2026-08-10" }, viewer)).toBe("late");
  });

  it("flags same when the person's stay is within the viewer's window", () => {
    expect(stayRelation({ start: "2026-08-05", end: "2026-08-08" }, viewer)).toBe("same");
    expect(stayRelation({ start: "2026-08-06", end: "2026-08-07" }, viewer)).toBe("same");
  });
});
