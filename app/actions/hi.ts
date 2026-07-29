"use server";

import { requireUser } from "@/lib/supabase/server";

type Result = { ok: boolean; error?: string };

// Low-stakes "Say hi" — persisted, but deliberately does not unlock contacts
// (see migration 0010). Idempotent: sending twice to the same person is a
// no-op success, not an error.
export async function sayHi(targetId: string): Promise<Result> {
  const { user, supabase } = await requireUser();
  if (targetId === user.id) return { ok: false, error: "That's you." };

  const { error } = await supabase
    .from("hi_requests")
    .insert({ from_user_id: user.id, to_user_id: targetId });
  if (error) {
    if (error.code === "23505") return { ok: true }; // already sent
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
