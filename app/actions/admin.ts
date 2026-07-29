"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { getConference, type Conference } from "@/lib/conference";
import {
  matchSlot,
  roundRobinGroups,
  validateAssignment,
  type SignupProfile,
  type MatchGroup,
} from "@/lib/matching";
import { nameGroups } from "@/lib/groupName";

type Result = { ok: boolean; groups?: number; flex?: boolean; error?: string };
type Svc = ReturnType<typeof serviceClient>;
type Slot = { id: string; starts_at: string };

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && user.email === process.env.ADMIN_EMAIL;
}

// Fetch signups → match (LLM or round-robin fallback) → validate → name →
// wipe/insert groups+members, for a single slot. Shared by the manual
// per-slot admin button (runMatching) and the auto-match cron path
// (runAllSlotsMatching), so there's exactly one matching pipeline.
async function matchOneSlot(
  svc: Svc,
  slot: Slot,
  conference: Conference | null,
): Promise<Result> {
  const { data: rows, error: sErr } = await svc
    .from("signups")
    .select("user_id, party_size, notes, profiles(name, school, position, interests)")
    .eq("slot_id", slot.id);
  if (sErr) return { ok: false, error: sErr.message };

  const signups: SignupProfile[] = (rows ?? []).map((r) => {
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

  if (signups.length === 0) return { ok: true, groups: 0 };

  const sizes = new Map(signups.map((s) => [s.userId, s.partySize ?? 1]));
  const headcount = (ids: string[]) => ids.reduce((n, id) => n + (sizes.get(id) ?? 1), 0);

  let groups: MatchGroup[];
  try {
    groups = await matchSlot(signups, {
      eventName: conference?.name,
      location: conference?.location,
    });
  } catch {
    groups = roundRobinGroups(signups); // ponytail: falls back on missing ANTHROPIC_API_KEY
  }
  // Validate by headcount (a party of 3 weighs 3), matching matchSlot's own check.
  if (!validateAssignment(signups.map((s) => s.userId), groups, 4, 6, sizes).ok)
    groups = roundRobinGroups(signups);

  // Name each table from the identity bank (data/group-names.json), not "Table N".
  // Uses each member's interests + position to pick a fitting playful name, deduped per slot.
  const profileMap = new Map(
    signups.map((s) => [s.userId, { interests: s.interests, position: s.position }]),
  );
  const names = nameGroups(groups, profileMap);

  // Idempotent: wipe prior groups for this slot (cascade drops group_members).
  const { error: delErr } = await svc.from("groups").delete().eq("slot_id", slot.id);
  if (delErr) return { ok: false, error: delErr.message };

  const { data: inserted, error: gErr } = await svc
    .from("groups")
    .insert(
      groups.map((g, i) => ({
        slot_id: slot.id,
        name: names[i],
        rationale: g.rationale,
        suggested_place: g.suggestedPlace,
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

  // One notification per seated member (migration 0014) — best-effort, doesn't
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
  return { ok: true, groups: groups.length, flex };
}

export async function runMatching(slotId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "forbidden" };

  const svc = serviceClient();
  const { data: slot, error: slotErr } = await svc
    .from("slots")
    .select("id, starts_at")
    .eq("id", slotId)
    .single();
  if (slotErr || !slot) return { ok: false, error: slotErr?.message ?? "slot not found" };

  const conference = await getConference(svc);
  return matchOneSlot(svc, slot, conference);
}

// Re-runs matching for every slot — used by the auto-match cron route
// (app/api/cron/auto-match) rather than the single-slot admin button.
export async function runAllSlotsMatching(
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
