import { describe, expect, it } from "vitest";
import { displayName, isUnnamed } from "./displayName";

describe("displayName", () => {
  it("passes a real name through untouched", () => {
    expect(displayName("Helen Mah")).toBe("Helen Mah");
  });

  // The live table card rendered one member as a bare dash: the row came from
  // an account that had signed in but never finished onboarding, so name,
  // school and position were all empty strings.
  it("covers every shape an unfinished profile arrives in", () => {
    expect(displayName("")).toBe("Someone");
    expect(displayName("   ")).toBe("Someone");
    expect(displayName(null)).toBe("Someone");
    expect(displayName(undefined)).toBe("Someone");
  });
});

describe("isUnnamed", () => {
  it("separates a set name from an unset one", () => {
    expect(isUnnamed("Helen Mah")).toBe(false);
    expect(isUnnamed("  ")).toBe(true);
    expect(isUnnamed(null)).toBe(true);
  });
});
