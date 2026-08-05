import { serviceClient } from "./supabase/service";
import { type Conference } from "./conference";
import {
  matchSlot,
  roundRobinGroups,
  repackInvalid,
  ROUND_ROBIN_RATIONALE,
  type SignupProfile,
  type MatchGroup,
} from "./matching";
import { isEligibleForSlot } from "./scheduleFilter";
import { nameGroups } from "./groupName";

// The matching pipeline lives here rather than in app/actions/admin.ts because
// that file is a "use server" module, where every export is a callable action
// endpoint. The cron route needs the all-slots runner, and exporting it from
// there would have published it as an endpoint anyone could POST to. A plain
// module is importable by both the admin action and the route without that.
export type Result = {
  ok: boolean;
  groups?: number;
  flex?: boolean;
  excluded?: number;
  alreadySeated?: number;
  // How the tables were actually built. "fallback" means nobody was seated by
  // interest, which looks identical to success from the outside: tables exist,
  // they are the right size, and every rationale reads "Grouped to keep tables
  // even." with no icebreaker question. The admin needs to be told.
  matcher?: "interests" | "fallback";
  // Signed up, eligible, not seated, and deliberately held back because there
  // are too few of them to make a table on their own. They get seated on the
  // next run once enough people join.
  waiting?: number;
  // Stragglers added to a table that already existed and had room, rather than
  // held back for a table of their own that may never fill.
  toppedUp?: number;
  error?: string;
};
type Svc = ReturnType<typeof serviceClient>;
export type Slot = { id: string; starts_at: string; join_deadline?: string | null };

// Smallest table worth seating, by headcount. Matches the `min` that matchSlot
// and repackInvalid already enforce.
const MIN_TABLE = 4;
// Seat ceiling, the same `max` passed to repackInvalid below.
const MAX_TABLE = 6;

// Share of interests in common, used only to decide which of several tables
// with room suits someone best. Same shape as lib/mentorMatch's jaccard.
function overlap(a: string[], b: string[]): number {
  const A = new Set(a.map((i) => i.trim().toLowerCase()).filter(Boolean));
  const B = new Set(b.map((i) => i.trim().toLowerCase()).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const i of A) if (B.has(i)) shared++;
  return shared / (A.size + B.size - shared);
}

// Puts a handful of stragglers on tables that already exist and are under the
// seat ceiling, rather than leaving them for a future run. Picks by interest
// overlap with who is already sitting there, so a top-up still answers "why
// this table", and falls back to the emptiest table when nothing overlaps.
async function seatIntoExistingTables(
  svc: Svc,
  slot: Slot,
  stragglers: SignupProfile[],
  allRows: { user_id: unknown; party_size: unknown; profiles: unknown }[],
  seatedRows: { user_id: unknown; group_id: unknown }[],
): Promise<{ count: number; headcount: number }> {
  const interestsOf = new Map<string, string[]>();
  const partyOf = new Map<string, number>();
  for (const r of allRows) {
    const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) ?? {};
    interestsOf.set(r.user_id as string, ((p as { interests?: string[] }).interests ?? []) as string[]);
    partyOf.set(r.user_id as string, (r.party_size as number | null) ?? 1);
  }

  const tables = new Map<string, { seats: number; interests: string[] }>();
  for (const m of seatedRows) {
    const id = m.group_id as string;
    const t = tables.get(id) ?? { seats: 0, interests: [] };
    t.seats += partyOf.get(m.user_id as string) ?? 1;
    t.interests.push(...(interestsOf.get(m.user_id as string) ?? []));
    tables.set(id, t);
  }
  if (tables.size === 0) return { count: 0, headcount: 0 };

  const placements: { group_id: string; user_id: string }[] = [];
  for (const person of stragglers) {
    const party = person.partySize ?? 1;
    const options = [...tables.entries()].filter(([, t]) => t.seats + party <= MAX_TABLE);
    if (!options.length) continue;
    options.sort((a, b) => {
      const byFit = overlap(person.interests, b[1].interests) - overlap(person.interests, a[1].interests);
      return byFit !== 0 ? byFit : a[1].seats - b[1].seats;
    });
    const [id, table] = options[0];
    table.seats += party;
    table.interests.push(...person.interests);
    placements.push({ group_id: id, user_id: person.userId });
  }
  if (!placements.length) return { count: 0, headcount: 0 };

  const { error } = await svc.from("group_members").insert(placements);
  if (error) return { count: 0, headcount: 0 };

  await svc.from("notifications").insert(
    placements.map((p) => ({
      user_id: p.user_id,
      type: "table_revealed" as const,
      payload: { group_id: p.group_id, slot_id: slot.id },
      ...(slot.join_deadline ? { visible_at: slot.join_deadline } : {}),
    })),
  );

  return {
    count: placements.length,
    headcount: placements.reduce((n, p) => n + (partyOf.get(p.user_id) ?? 1), 0),
  };
}

// Fetch signups → drop anyone already seated → match (LLM or round-robin
// fallback) → validate → name → insert groups+members, for a single slot.
// Shared by the manual per-slot admin button (runMatching) and the auto-match
// cron path (runAllSlots), so there's exactly one matching pipeline.
//
// Incremental, not idempotent. Re-running seats the people who joined since
// the last run and leaves every existing table exactly as it is. It used to
// delete the slot's groups first, which cascaded group_members and
// message_reads but not messages (messages.channel_id carries no foreign key),
// so a re-run stranded the conversation and reshuffled people who had already
// been told who they were sitting with.
export async function matchOneSlot(
  svc: Svc,
  slot: Slot,
  conference: Conference | null,
): Promise<Result> {
  const { data: rows, error: sErr } = await svc
    .from("signups")
    .select(
      "user_id, party_size, notes, profiles(name, school, position, interests, event_id, stay_start, stay_end)",
    )
    .eq("slot_id", slot.id);
  if (sErr) return { ok: false, error: sErr.message };

  const { data: seatedRows, error: seatedErr } = await svc
    .from("group_members")
    .select("user_id, group_id, groups!inner(slot_id)")
    .eq("groups.slot_id", slot.id);
  if (seatedErr) return { ok: false, error: seatedErr.message };
  const seated = new Set((seatedRows ?? []).map((r) => r.user_id as string));

  const unseatedRows = (rows ?? []).filter((r) => !seated.has(r.user_id as string));
  const alreadySeated = (rows?.length ?? 0) - unseatedRows.length;

  // Hard schedule filter: someone who opted out of this conference, or whose
  // stay doesn't cover this slot's date, is never eligible. Interest fit must
  // never override a schedule conflict. Left ungrouped this run, not deleted
  // from signups.
  const eligibleRows = unseatedRows.filter((r) => {
    const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) ?? {};
    return isEligibleForSlot(
      {
        event_id: p.event_id as string | null,
        stay_start: p.stay_start as string | null,
        stay_end: p.stay_end as string | null,
      },
      slot.starts_at,
    );
  });
  const excluded = unseatedRows.length - eligibleRows.length;

  const signups: SignupProfile[] = eligibleRows.map((r) => {
    // supabase types the joined relation as an array; it's a single row here.
    const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) ?? {};
    return {
      userId: r.user_id as string,
      name: (p.name as string) ?? "",
      school: (p.school as string) ?? "",
      position: (p.position as string) ?? "",
      interests: (p.interests as string[]) ?? [],
      partySize: (r.party_size as number | null) ?? 1,
      notes: (r.notes as string) ?? "",
    };
  });

  if (signups.length === 0) return { ok: true, groups: 0, excluded, alreadySeated };

  const sizes = new Map(signups.map((s) => [s.userId, s.partySize ?? 1]));
  const headcount = (ids: string[]) => ids.reduce((n, id) => n + (sizes.get(id) ?? 1), 0);

  // A top-up run with only a couple of stragglers would otherwise seat them at
  // a table of one or two and tell them "Your table is set", which is worse
  // than telling them nothing. Hold them until there are enough for a real
  // table. Only applies once the slot already has tables: a slot's first run
  // still seats whoever showed up, however few, because that is the whole
  // dinner rather than a leftover.
  const waiting = headcount(signups.map((s) => s.userId));
  if (alreadySeated > 0 && waiting < MIN_TABLE) {
    // Before holding anyone back, look for a table that simply has room. A
    // leftover this small used to wait for company that may never arrive, and
    // on a slot whose deadline then passed those people ended up at no table
    // at all while a half empty one sat next to them.
    const seated = await seatIntoExistingTables(svc, slot, signups, rows ?? [], seatedRows ?? []);
    const stillWaiting = waiting - seated.headcount;
    if (seated.count > 0) {
      return {
        ok: true,
        groups: 0,
        excluded,
        alreadySeated,
        toppedUp: seated.count,
        ...(stillWaiting > 0 ? { waiting: stillWaiting } : {}),
      };
    }
    return { ok: true, groups: 0, excluded, alreadySeated, waiting };
  }

  let groups: MatchGroup[];
  try {
    groups = await matchSlot(signups, {
      eventName: conference?.name,
    });
  } catch (e) {
    // Log it. A missing or empty OPENAI_API_KEY lands here, and swallowing
    // the error silently is how every table in this deployment ended up
    // round-robin without anyone noticing.
    console.error("[matching] interest matching failed, falling back:", e);
    groups = roundRobinGroups(signups);
  }
  // Validate by headcount (a party of 3 weighs 3), matching matchSlot's own check.
  // Keeps whatever tables are already valid, only re-packing the ones that aren't
  // (see lib/matching.ts's repackInvalid), instead of discarding the whole slot.
  const ids = signups.map((s) => s.userId);
  groups = repackInvalid(groups, ids, signups, 4, 6, sizes);

  // Name each table from the identity bank (data/group-names.json), not "Table N",
  // but only for tables the LLM actually interest-matched. A round-robin/repacked
  // table (ROUND_ROBIN_RATIONALE) keeps its plain "Table N" name and already-honest
  // rationale, instead of drawing a themed name that would contradict it.
  const profileMap = new Map(
    signups.map((s) => [s.userId, { interests: s.interests, position: s.position }]),
  );
  const llmGroups = groups.filter((g) => g.rationale !== ROUND_ROBIN_RATIONALE);
  const matcher = llmGroups.length ? "interests" : "fallback";
  const llmNames = nameGroups(llmGroups, profileMap);
  let llmIdx = 0;
  const names = groups.map((g) =>
    g.rationale === ROUND_ROBIN_RATIONALE ? g.name : llmNames[llmIdx++],
  );

  const { data: inserted, error: gErr } = await svc
    .from("groups")
    .insert(
      groups.map((g, i) => ({
        slot_id: slot.id,
        name: names[i],
        rationale: g.rationale,
        starter_question: g.starterQuestion,
        meet_time: slot.starts_at,
        // Seated now, shown at the moment people were already promised
        // (migration 0026). Null would mean "revealed", so a slot with no
        // deadline behaves exactly as it did before.
        reveal_at: slot.join_deadline ?? null,
      })),
    )
    .select("id");
  if (gErr || !inserted) return { ok: false, error: gErr?.message ?? "insert failed" };

  const members = inserted.flatMap((row, i) =>
    groups[i].memberIds.map((user_id) => ({ group_id: row.id as string, user_id })),
  );
  const { error: mErr } = await svc.from("group_members").insert(members);
  if (mErr) return { ok: false, error: mErr.message };

  // One notification per seated member (migration 0014), best-effort, doesn't
  // fail the match if it errors (the groups/members rows are already committed).
  await svc.from("notifications").insert(
    members.map((m) => ({
      user_id: m.user_id,
      type: "table_revealed" as const,
      payload: { group_id: m.group_id, slot_id: slot.id },
      // Held back to the reveal alongside the group itself, or the bell would
      // announce the table days before anyone could open it.
      ...(slot.join_deadline ? { visible_at: slot.join_deadline } : {}),
    })),
  );

  // Flex = some table seats fewer than 4 by headcount (an unavoidable small table).
  const flex =
    groups.length > 0 && Math.min(...groups.map((g) => headcount(g.memberIds))) < 4;
  return { ok: true, groups: groups.length, flex, excluded, alreadySeated, matcher };
}

// Runs matching for every slot, used by the auto-match cron route
// (app/api/cron/auto-match) rather than the single-slot admin button.
export async function runAllSlots(
  conference: Conference | null,
): Promise<{ ok: boolean; results: (Result & { slotId: string })[] }> {
  const svc = serviceClient();
  const { data: slots, error } = await svc.from("slots").select("id, starts_at, join_deadline");
  if (error) return { ok: false, results: [] };

  const results: (Result & { slotId: string })[] = [];
  for (const slot of (slots ?? []) as Slot[]) {
    const r = await matchOneSlot(svc, slot, conference);
    results.push({ ...r, slotId: slot.id });
  }
  return { ok: results.every((r) => r.ok), results };
}
