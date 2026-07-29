import { describe, it, expect } from "vitest";
import { validateAssignment, roundRobinGroups, buildMatchPrompt, type SignupProfile } from "./matching";

const ids = (n: number) => Array.from({length: n}, (_, i) => `u${i}`);

// Build signup profiles from a list of party sizes: sizes[i] is user u{i}'s headcount.
const parties = (sizes: number[]): SignupProfile[] =>
  sizes.map((size, i) => ({ userId: `u${i}`, name: `u${i}`, school: "",
    position: "", interests: [], partySize: size }));

const sizeMap = (sizes: number[]) =>
  new Map(sizes.map((s, i) => [`u${i}`, s]));

const headcount = (memberIds: string[], sizes: Map<string, number>) =>
  memberIds.reduce((n, id) => n + (sizes.get(id) ?? 1), 0);

describe("validateAssignment", () => {
  it("passes a clean partition", () => {
    const r = validateAssignment(ids(10),
      [{memberIds: ids(10).slice(0,5)}, {memberIds: ids(10).slice(5)}]);
    expect(r.ok).toBe(true);
  });
  it("catches missing and duplicated users", () => {
    const r = validateAssignment(ids(10),
      [{memberIds: ["u0","u1","u2","u3","u0"]}, {memberIds: ["u5","u6","u7","u8"]}]);
    expect(r.ok).toBe(false);
    expect(r.dupes).toContain("u0");
    expect(r.missing).toContain("u4");
    expect(r.missing).toContain("u9");
  });
  it("flags oversize groups", () => {
    const r = validateAssignment(ids(7), [{memberIds: ids(7)}]);
    expect(r.ok).toBe(false);
    expect(r.oversize).toEqual([0]);
  });
  it("flags unknown ids not in the signup list", () => {
    const r = validateAssignment(ids(5), [{memberIds: [...ids(5), "ghost"]}]);
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("ghost");
  });
});

describe("roundRobinGroups", () => {
  const profiles = ids(13).map(id => ({ userId: id, name: id, school: "",
    position: "", interests: [] }));
  it("partitions everyone exactly once within size bounds", () => {
    const gs = roundRobinGroups(profiles);
    const all = gs.flatMap(g => g.memberIds).sort();
    expect(all).toEqual(ids(13).sort());
    for (const g of gs) {
      expect(g.memberIds.length).toBeGreaterThanOrEqual(4);
      expect(g.memberIds.length).toBeLessThanOrEqual(6);
    }
  });
  it("handles n<min as one flex group", () => {
    const gs = roundRobinGroups(profiles.slice(0, 3));
    expect(gs.length).toBe(1);
    expect(gs[0].memberIds.length).toBe(3);
  });
  it("handles n=0 without crashing", () => {
    const gs = roundRobinGroups([]);
    expect(gs.length).toBe(1);
    expect(gs[0].memberIds).toEqual([]);
  });
});

describe("roundRobinGroups — party headcount", () => {
  it("seats a pair and a trio at one table of 5", () => {
    const sizes = [3, 2];
    const gs = roundRobinGroups(parties(sizes));
    expect(gs.length).toBe(1);
    expect(gs[0].memberIds.sort()).toEqual(["u0", "u1"]);
    expect(headcount(gs[0].memberIds, sizeMap(sizes))).toBe(5);
  });

  it("packs two trios without exceeding max headcount", () => {
    const sizes = [3, 3];
    const gs = roundRobinGroups(parties(sizes));
    const sm = sizeMap(sizes);
    for (const g of gs) expect(headcount(g.memberIds, sm)).toBeLessThanOrEqual(6);
    // both trios placed, everyone once
    expect(gs.flatMap((g) => g.memberIds).sort()).toEqual(["u0", "u1"]);
  });

  it("keeps two parties of 4 at separate tables (8 > max)", () => {
    const sizes = [4, 4];
    const gs = roundRobinGroups(parties(sizes));
    const sm = sizeMap(sizes);
    expect(gs.length).toBe(2);
    for (const g of gs) expect(headcount(g.memberIds, sm)).toBe(4);
  });

  it("gives a full party of 6 its own table", () => {
    const sizes = [6];
    const gs = roundRobinGroups(parties(sizes));
    expect(gs.length).toBe(1);
    expect(headcount(gs[0].memberIds, sizeMap(sizes))).toBe(6);
  });

  it("balances 7 solo diners into 4+3, not a lone diner (6+1)", () => {
    const sizes = Array(7).fill(1);
    const gs = roundRobinGroups(parties(sizes));
    const sm = sizeMap(sizes);
    expect(gs.length).toBe(2);
    for (const g of gs) {
      const h = headcount(g.memberIds, sm);
      expect(h).toBeLessThanOrEqual(6);
      expect(h).toBeGreaterThanOrEqual(3); // no lone diner
    }
  });

  it("seats a lone party bigger than max alone, without leaving stray empty bins", () => {
    // A party of 7 can't fit under max=6 with anyone else, and can't be split
    // (atoms are never split) — it must still get exactly one non-empty group,
    // with none of the pre-allocated empty bins leaking through as phantom
    // zero-member tables (which would otherwise get inserted into the DB as a
    // broken, member-less group row).
    const sizes = [7];
    const gs = roundRobinGroups(parties(sizes));
    expect(gs.length).toBe(1);
    expect(gs[0].memberIds).toEqual(["u0"]);
    expect(headcount(gs[0].memberIds, sizeMap(sizes))).toBe(7);
  });

  it("gives each of two lone oversized parties its own group, no phantom empties", () => {
    const sizes = [7, 8];
    const gs = roundRobinGroups(parties(sizes));
    expect(gs.length).toBe(2);
    expect(gs.every((g) => g.memberIds.length > 0)).toBe(true);
    const all = gs.flatMap((g) => g.memberIds).sort();
    expect(all).toEqual(["u0", "u1"]);
  });

  it("never exceeds max headcount and seats everyone exactly once (mixed)", () => {
    const sizes = [1, 2, 3, 4, 1, 2, 3, 1, 2, 5, 1];
    const gs = roundRobinGroups(parties(sizes));
    const sm = sizeMap(sizes);
    const all = gs.flatMap((g) => g.memberIds).sort();
    expect(all).toEqual(ids(sizes.length).sort());
    for (const g of gs) expect(headcount(g.memberIds, sm)).toBeLessThanOrEqual(6);
    // no atom split: every id appears exactly once (already covered by all==ids, no dupes)
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("buildMatchPrompt", () => {
  it("interpolates eventName and location when given", () => {
    const p = buildMatchPrompt([], { min: 4, max: 6, eventName: "KSEA 2026", location: "Washington, DC" });
    expect(p).toContain("KSEA 2026 attendees");
    expect(p).toContain("near Washington, DC");
  });
  it("falls back to generic phrasing when eventName/location are omitted", () => {
    const p = buildMatchPrompt([], { min: 4, max: 6 });
    expect(p).toContain("conference attendees");
    expect(p).not.toContain("near ");
  });
  it("embeds the min/max seat bounds and the roster JSON", () => {
    const roster = [{ userId: "u0" }];
    const p = buildMatchPrompt(roster, { min: 4, max: 6 });
    expect(p).toContain("4-6 people TOTAL");
    expect(p).toContain(JSON.stringify(roster, null, 1));
  });
});

describe("validateAssignment — unavoidable oversize (indivisible party > max)", () => {
  it("flags an unavoidable oversized table as not-ok, even though it's the only possible grouping", () => {
    // Documents an existing gap, not a new fix: roundRobinGroups() will still
    // produce (and app/actions/admin.ts's matchOneSlot will still insert) this
    // exact table, since parties can never be split. validateAssignment's
    // "oversize is a hard fail" is informational here, not enforced upstream —
    // there's no retry/split path for an indivisible party bigger than max.
    const sizes = new Map([["a", 7]]);
    const r = validateAssignment(["a"], [{ memberIds: ["a"] }], 4, 6, sizes);
    expect(r.ok).toBe(false);
    expect(r.oversize).toEqual([0]);
  });
});

describe("validateAssignment — by headcount", () => {
  it("accepts a table whose member-count is 2 but headcount is 5", () => {
    const sizes = new Map([["a", 3], ["b", 2]]);
    const r = validateAssignment(["a", "b"], [{ memberIds: ["a", "b"] }], 4, 6, sizes);
    expect(r.ok).toBe(true);
  });
  it("flags a table oversized by headcount even with few members", () => {
    const sizes = new Map([["a", 3], ["b", 3], ["c", 2]]);
    const r = validateAssignment(["a", "b", "c"], [{ memberIds: ["a", "b", "c"] }], 4, 6, sizes);
    expect(r.ok).toBe(false);
    expect(r.oversize).toEqual([0]);
  });
});
