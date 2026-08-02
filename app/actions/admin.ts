"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/isAdmin";
import { serviceClient } from "@/lib/supabase/service";
import { getConference } from "@/lib/conference";
import { matchOneSlot, type Result } from "@/lib/matchRunner";

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdmin(user);
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
