"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

type Result = { ok: boolean; error?: string };

export type ScheduleItemInput = {
  id?: string;
  starts_at: string;
  ends_at: string;
  title: string;
  sort_order: number;
};

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && user.email === process.env.ADMIN_EMAIL;
}

export async function upsertScheduleItem(fields: ScheduleItemInput): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "forbidden" };
  if (!fields.title.trim()) return { ok: false, error: "Title is required." };
  if (new Date(fields.starts_at) >= new Date(fields.ends_at))
    return { ok: false, error: "Start must be before end." };

  const svc = serviceClient();
  const { id, ...rest } = fields;
  const { error } = id
    ? await svc.from("schedule_items").update(rest).eq("id", id)
    : await svc.from("schedule_items").insert(rest);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteScheduleItem(id: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: "forbidden" };
  const svc = serviceClient();
  const { error } = await svc.from("schedule_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
