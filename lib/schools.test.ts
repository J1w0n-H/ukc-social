import { describe, it, expect } from "vitest";
import { normalizeSchool, parseRorOrgs, matchCanonical, type School } from "./schools";

// Shaped like a real ROR v2 record, trimmed to the fields we read.
const wisconsin = {
  types: ["education", "funder"],
  names: [
    { value: "UW", types: ["acronym"] },
    { value: "UW–Madison", types: ["alias"] },
    { value: "University of Wisconsin–Madison", types: ["ror_display", "label"] },
    { value: "Universidad de Wisconsin-Madison", types: ["label"] },
  ],
};

describe("normalizeSchool", () => {
  it("collapses the dash and spacing variants people actually type", () => {
    const forms = [
      "University of Wisconsin–Madison",
      "University of Wisconsin-Madison",
      "university of wisconsin madison",
      "  University  of Wisconsin - Madison ",
    ];
    const seen = new Set(forms.map(normalizeSchool));
    expect(seen.size).toBe(1);
  });

  it("keeps Korean characters", () => {
    expect(normalizeSchool("서울대학교")).toBe("서울대학교");
  });
});

describe("parseRorOrgs", () => {
  it("takes the display name and the alias/acronym forms", () => {
    const [s] = parseRorOrgs([wisconsin]);
    expect(s.name).toBe("University of Wisconsin–Madison");
    expect(s.aliases).toEqual(["UW", "UW–Madison"]);
  });

  it("drops anything that is not a school", () => {
    expect(parseRorOrgs([{ types: ["funder"], names: [{ value: "X", types: ["ror_display"] }] }])).toEqual([]);
  });

  it("survives a shape it did not expect", () => {
    expect(parseRorOrgs(null)).toEqual([]);
    expect(parseRorOrgs([{}])).toEqual([]);
  });
});

describe("matchCanonical", () => {
  const schools: School[] = parseRorOrgs([wisconsin]);

  it("resolves the abbreviation and the hyphen spelling to one name", () => {
    expect(matchCanonical("UW Madison", schools)).toBe("University of Wisconsin–Madison");
    expect(matchCanonical("University of Wisconsin-Madison", schools)).toBe("University of Wisconsin–Madison");
  });

  it("leaves something it does not recognise alone", () => {
    expect(matchCanonical("Samsung Research", schools)).toBeNull();
    expect(matchCanonical("", schools)).toBeNull();
  });
});
