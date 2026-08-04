import { describe, it, expect } from "vitest";
import { POSITIONS, toRole, canonicalPosition } from "./roles";
import { isMentor, isMentee, type Person } from "./mentorMatch";

describe("toRole", () => {
  it("maps every offered option to a role the matcher understands", () => {
    for (const p of POSITIONS) expect(toRole(p)).not.toBeNull();
  });

  it("returns null for anything not on the list", () => {
    expect(toRole("Graduate Student")).toBeNull();
    expect(toRole("")).toBeNull();
  });

  it("puts students on the mentee side and everyone else on the mentor side", () => {
    const as = (position: string): Person => ({
      id: "x", name: "x", school: "x", field: "x", researchArea: "x", interests: [],
      role: toRole(position)!,
    });
    expect(isMentee(as("Undergraduate"))).toBe(true);
    expect(isMentee(as("Master's"))).toBe(true);
    expect(isMentor(as("PhD"))).toBe(true);
    expect(isMentor(as("Postdoc"))).toBe(true);
    expect(isMentor(as("Faculty"))).toBe(true);
    expect(isMentor(as("Working"))).toBe(true);
  });
});

describe("canonicalPosition", () => {
  it("folds the spellings that are already stored", () => {
    expect(canonicalPosition("Bachelors")).toBe("Undergraduate");
    expect(canonicalPosition("Undergrad")).toBe("Undergraduate");
  });

  it("is not fooled by case or punctuation", () => {
    expect(canonicalPosition("ph.d.")).toBe("PhD");
    expect(canonicalPosition("  MASTERS ")).toBe("Master's");
    expect(canonicalPosition("Master's")).toBe("Master's");
  });

  it("refuses to guess when the stage is genuinely ambiguous", () => {
    // Master's and PhD land on opposite sides of the mentor split, so this
    // must stay a question for the person rather than a coin flip.
    expect(canonicalPosition("Graduate Student")).toBeNull();
    expect(canonicalPosition("")).toBeNull();
    expect(canonicalPosition("Chief Vibes Officer")).toBeNull();
  });
});
