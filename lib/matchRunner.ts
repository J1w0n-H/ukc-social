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
  error?: string;
};
type Svc = ReturnType<typeof serviceClient>;
export type Slot = { id: string; starts_at: string };

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
    .select("user_id, groups!inner(slot_id)")
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

  let groups: MatchGroup[];
  try {
    groups = await matchSlot(signups, {
      eventName: conference?.name,
    });
  } catch {
    groups = roundRobinGroups(signups); // ponytail: falls back on missing ANTHROPIC_API_KEY
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
    })),
  );

  // Flex = some table seats fewer than 4 by headcount (an unavoidable small table).
  const flex =
    groups.length > 0 && Math.min(...groups.map((g) => headcount(g.memberIds))) < 4;
  return { ok: true, groups: groups.length, flex, excluded, alreadySeated };
}

// Runs matching for every slot, used by the auto-match cron route
// (app/api/cron/auto-match) rather than the single-slot admin button.
export async function runAllSlots(
  conference: Conference | null,
): Promise<{ ok: boolean; results: (Result & { slotId: string })[] }> {
  const svc = serviceClient();
  const { data: slots, error } = await svc.from("slots").select("id, starts_at");
  if (error) return { ok: false, results: [] };

  const results: (Result & { slotId: string })[] = [];
  for (const slot of (slots ?? []) as Slot[]) {
    const r = await matchOneSlot(svc, slot, conference);
    results.push({ ...r, slotId: slot.id });
  }
  return { ok: results.every((r) => r.ok), results };
}
