import { describe, expect, it } from "vitest";
import { rankSuggestions, type Candidate } from "./suggestPerson";

const me = { id: "me", school: "UMKC", interests: ["robotics", "climbing"] };

const person = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id,
  name: `Person ${id}`,
  photo_url: null,
  school: "Purdue",
  position: "phd",
  interests: [],
  ...over,
});

describe("rankSuggestions", () => {
  it("puts the strongest interest overlap first", () => {
    const out = rankSuggestions(me, [
      person("a", { interests: ["climbing"] }),
      person("b", { interests: ["robotics", "climbing"] }),
      person("c", { interests: ["baking"] }),
    ], []);

    expect(out.map((p) => p.id)).toEqual(["b", "a", "c"]);
    expect(out[0].shared).toEqual(["robotics", "climbing"]);
  });

  it("reports the shared interests in the other person's wording", () => {
    const out = rankSuggestions(me, [person("a", { interests: ["Robotics"] })], []);
    expect(out[0].shared).toEqual(["Robotics"]);
  });

  it("caps the shared list so the line stays on one row", () => {
    const wide = { id: "me", school: "UMKC", interests: ["a", "b", "c", "d"] };
    const out = rankSuggestions(wide, [person("a", { interests: ["a", "b", "c", "d"] })], []);
    expect(out[0].shared).toHaveLength(2);
  });

  it("never suggests you, anyone already asked, or a profile with no name", () => {
    const out = rankSuggestions(me, [
      person("me"),
      person("asked", { interests: ["robotics"] }),
      person("blank", { name: "  ", interests: ["robotics"] }),
      person("ok", { interests: ["robotics"] }),
    ], ["asked"]);

    expect(out.map((p) => p.id)).toEqual(["ok"]);
  });

  it("still returns someone when nobody shares an interest", () => {
    const out = rankSuggestions(me, [person("a"), person("b")], []);
    expect(out).toHaveLength(2);
    expect(out[0].shared).toEqual([]);
  });

  // A random tie-break would put a different person in the row on every
  // render, which reads as noise rather than a suggestion.
  it("returns the same order on every call when scores tie", () => {
    const pool = [person("c"), person("a"), person("b")];
    const first = rankSuggestions(me, pool, []).map((p) => p.id);
    expect(first).toEqual(["a", "b", "c"]);
    expect(rankSuggestions(me, [...pool].reverse(), []).map((p) => p.id)).toEqual(first);
  });

  it("prefers a different school when the interests are equal", () => {
    const out = rankSuggestions(me, [
      person("same", { school: "UMKC", interests: ["robotics"] }),
      person("other", { school: "Purdue", interests: ["robotics"] }),
    ], []);
    expect(out[0].id).toBe("other");
  });

  it("returns nothing once everyone has been asked", () => {
    expect(rankSuggestions(me, [person("a"), person("b")], ["a", "b"])).toEqual([]);
  });
});
