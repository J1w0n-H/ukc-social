"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/isAdmin";
import { serviceClient } from "@/lib/supabase/service";
import { deriveSlots } from "@/lib/slots";

type Result = { ok: boolean; error?: string };

export type ConferenceInput = {
  id?: string;
  name: string;
  location: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  utc_offset: string;
  airport_code: string;
  auto_matching_enabled: boolean;
  matching_interval_minutes: number;
  announcement: string;
};

// Registers (or edits, if `id` is passed) the deployment's conference. One
// deployment/fork = one conference in practice, so this is an upsert-by-id
// rather than an always-insert, keeping it a de-facto singleton without a
// DB-level constraint.
export async function upsertConference(fields: ConferenceInput): Promise<Result> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdmin(user))) return { ok: false, error: "forbidden" };

  if (!fields.name.trim()) return { ok: false, error: "Name is required." };
  if (new Date(fields.starts_at) >= new Date(fields.ends_at))
    return { ok: false, error: "Start date must be before end date." };
  if (!Number.isFinite(fields.matching_interval_minutes) || fields.matching_interval_minutes <= 0)
    return { ok: false, error: "Matching interval must be a positive number of minutes." };

  const svc = serviceClient();
  const { id, ...rest } = fields;

  // Compare against what's already stored *before* writing, so a new/changed
  // announcement can be told apart from every other field on this form being
  // re-saved (dates, timezone, etc.) with the announcement untouched.
  let previousAnnouncement: string | null = null;
  if (id) {
    const { data: prior } = await svc.from("conferences").select("announcement").eq("id", id).maybeSingle();
    previousAnnouncement = (prior?.announcement as string | null) ?? null;
  }

  const { error } = id
    ? await svc.from("conferences").update(rest).eq("id", id)
    : await svc.from("conferences").insert(rest);
  if (error) return { ok: false, error: error.message };

  // Broadcast a new/changed announcement to everyone — the actor (admin)
  // isn't a recipient of their own broadcast, so this always needs the
  // service-role client, same as every other cross-user notification write.
  if (rest.announcement.trim() && rest.announcement.trim() !== (previousAnnouncement ?? "").trim()) {
    const { data: profiles } = await svc.from("profiles").select("id");
    if (profiles?.length) {
      await svc.from("notifications").insert(
        profiles.map((p) => ({
          user_id: p.id as string,
          type: "announcement" as const,
          payload: {},
        })),
      );
    }
  }

  // Slots (lunch/dinner, one per day) come from the conference's own dates —
  // no separate admin form to hand-enter them. Only fills in titles that
  // don't exist yet: if the conference's dates change later, existing slots
  // (which may already have real signups/groups) are left alone rather than
  // silently rewritten or deleted.
  const drafts = deriveSlots(rest);
  const { data: existing } = await svc.from("slots").select("title");
  const have = new Set((existing ?? []).map((s) => s.title as string));
  const missing = drafts.filter((s) => !have.has(s.title));
  if (missing.length) {
    const { error: slotErr } = await svc.from("slots").insert(missing);
    if (slotErr) return { ok: false, error: slotErr.message };
  }

  return { ok: true };
}
