import { describe, it, expect, vi } from "vitest";

// matchSlot is the LLM call. Forcing it to throw drives matchOneSlot down its
// documented round-robin fallback, so these tests describe the seating rules
// without an API key and without a model in the loop.
vi.mock("./matching", async () => {
  const actual = await vi.importActual<typeof import("./matching")>("./matching");
  return { ...actual, matchSlot: vi.fn(async () => { throw new Error("no key"); }) };
});

const { matchOneSlot } = await import("./matchRunner");

const SLOT = { id: "slot-1", starts_at: "2026-08-06T18:00:00Z" };

type Call = { table: string; op: string; payload: unknown; cols?: string };

// Returns one row id per group being inserted, the way PostgREST does, so
// matchOneSlot's inserted-row-to-group zip lines up.
const insertedIds = (state: Call) => ({
  data: (state.payload as unknown[]).map((_, i) => ({ id: `g-new-${i + 1}` })),
  error: null,
});

// Minimal stand-in for the PostgREST builder: chainable, thenable, and it
// records every call so a test can assert on what was written (and, more to
// the point here, on what was not).
type Fixture =
  | { data: unknown; error: unknown }
  | ((state: Call) => { data: unknown; error: unknown });

function makeSvc(fixtures: Record<string, Fixture>) {
  const calls: Call[] = [];
  function from(table: string) {
    const state: Call = { table, op: "select", payload: null };
    const api = {
      select(cols: string) {
        state.cols = cols;
        return api;
      },
      eq() {
        return api;
      },
      insert(rows: unknown) {
        state.op = "insert";
        state.payload = rows;
        calls.push(state);
        return api;
      },
      delete() {
        state.op = "delete";
        calls.push(state);
        return api;
      },
      then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
        if (state.op === "select") calls.push(state);
        const f = fixtures[`${table}:${state.op}`] ?? { data: [], error: null };
        const res = typeof f === "function" ? f(state) : f;
        return Promise.resolve(res).then(resolve, reject);
      },
    };
    return api;
  }
  return { svc: { from } as never, calls };
}

const signup = (n: number) => ({
  user_id: `u${n}`,
  party_size: 1,
  notes: "",
  profiles: {
    name: `Person ${n}`,
    school: "UKC",
    position: "phd",
    interests: ["robotics"],
    event_id: "conf-1",
    stay_start: "2026-08-04",
    stay_end: "2026-08-08",
  },
});

const setup = (signupCount: number, seatedIds: string[]) =>
  makeSvc({
    "signups:select": {
      data: Array.from({ length: signupCount }, (_, i) => signup(i + 1)),
      error: null,
    },
    "group_members:select": { data: seatedIds.map((user_id) => ({ user_id })), error: null },
    "groups:insert": insertedIds,
  });

const memberIds = (calls: Call[]) =>
  (calls.find((c) => c.table === "group_members" && c.op === "insert")?.payload as
    | { user_id: string }[]
    | undefined) ?? [];

describe("matchOneSlot seating", () => {
  it("seats everyone when the slot has no tables yet", async () => {
    const { svc, calls } = setup(8, []);
    const r = await matchOneSlot(svc, SLOT, null);

    expect(r.ok).toBe(true);
    expect(r.alreadySeated).toBe(0);
    expect(memberIds(calls).map((m) => m.user_id).sort()).toEqual([
      "u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8",
    ]);
  });

  it("seats only the signups that joined since the last run", async () => {
    const { svc, calls } = setup(9, ["u1", "u2", "u3", "u4"]);
    const r = await matchOneSlot(svc, SLOT, null);

    expect(r.ok).toBe(true);
    expect(r.alreadySeated).toBe(4);
    expect(memberIds(calls).map((m) => m.user_id).sort()).toEqual(["u5", "u6", "u7", "u8", "u9"]);
  });

  it("never deletes existing groups", async () => {
    const { svc, calls } = setup(9, ["u1", "u2", "u3", "u4"]);
    await matchOneSlot(svc, SLOT, null);

    expect(calls.filter((c) => c.op === "delete")).toEqual([]);
  });

  it("notifies only the newly seated", async () => {
    const { svc, calls } = setup(9, ["u1", "u2", "u3", "u4"]);
    await matchOneSlot(svc, SLOT, null);

    const notified = (calls.find((c) => c.table === "notifications")?.payload ??
      []) as { user_id: string; type: string }[];
    expect(notified.map((n) => n.user_id).sort()).toEqual(["u5", "u6", "u7", "u8", "u9"]);
    expect(notified.every((n) => n.type === "table_revealed")).toBe(true);
  });

  it("writes nothing when everyone signed up is already seated", async () => {
    const { svc, calls } = setup(4, ["u1", "u2", "u3", "u4"]);
    const r = await matchOneSlot(svc, SLOT, null);

    expect(r).toEqual({ ok: true, groups: 0, excluded: 0, alreadySeated: 4 });
    expect(calls.filter((c) => c.op === "insert")).toEqual([]);
  });

  it("counts schedule-excluded signups only among the unseated", async () => {
    const { svc } = makeSvc({
      "signups:select": {
        // u1 is seated already; u2 opted out of the conference (no event_id).
        data: [
          signup(1),
          { ...signup(2), profiles: { ...signup(2).profiles, event_id: null } },
          signup(3),
          signup(4),
          signup(5),
          signup(6),
        ],
        error: null,
      },
      "group_members:select": { data: [{ user_id: "u1" }], error: null },
      "groups:insert": insertedIds,
    });
    const r = await matchOneSlot(svc, SLOT, null);

    expect(r.alreadySeated).toBe(1);
    expect(r.excluded).toBe(1);
  });
});
