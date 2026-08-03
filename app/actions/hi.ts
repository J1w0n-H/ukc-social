"use server";

import { requireUser } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

type Result = { ok: boolean; error?: string };

// Friend requests. A request is a row in hi_requests; accepting it makes the two
// people a channel (migration 0023 widened shares_channel), which is what
// unlocks contacts and opens the direct thread. Everything here writes through
// the caller's own session so RLS is the real check, except the notifications,
// which are addressed to the other person and so need service-role.

export async function sendRequest(targetId: string): Promise<Result> {
  const { user, supabase } = await requireUser();
  if (targetId === user.id) return { ok: false, error: "That's you." };

  const { error } = await supabase
    .from("hi_requests")
    .insert({ from_user_id: user.id, to_user_id: targetId });
  if (error) {
    // Idempotent: asking twice is a no-op success, not an error. The unique
    // (from_user_id, to_user_id) index is what makes it one.
    if (error.code === "23505") return { ok: true };
    return { ok: false, error: error.message };
  }

  // Your own name, so the bell can say who asked instead of "Someone". Read
  // through your session rather than service-role, since p_sel already lets you
  // read your own row. Stored on the notification rather than resolved at
  // render time: the bell shows thirty rows and would otherwise need a lookup
  // per row, and a notification reads better as a record of what was true when
  // it fired.
  const { data: me } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  await serviceClient().from("notifications").insert({
    user_id: targetId,
    type: "hi_received",
    payload: { from_user_id: user.id, from_name: me?.name || "" },
  });

  return { ok: true };
}

// Only the recipient reaches here: hi_upd is scoped to to_user_id, so a sender
// calling this updates zero rows rather than approving their own request. The
// status = 'pending' filter is what makes a double-tap land once.
export async function respondToRequest(requestId: string, accept: boolean): Promise<Result> {
  const { user, supabase } = await requireUser();

  const { data: updated, error } = await supabase
    .from("hi_requests")
    .update({ status: accept ? "accepted" : "declined" })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("from_user_id, slug")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!updated) return { ok: false, error: "That request is no longer open." };

  // Only acceptance is announced. Telling someone they were declined turns a
  // quiet no into a notification, and there is nothing for them to do about it.
  if (accept) {
    const { data: me } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle();
    // slug is what the link needs (migration 0024). request_id stays alongside
    // it so the payload still identifies the row for anything that wants it.
    await serviceClient().from("notifications").insert({
      user_id: updated.from_user_id as string,
      type: "friend_accepted",
      payload: {
        from_user_id: user.id,
        from_name: me?.name || "",
        request_id: requestId,
        slug: updated.slug,
      },
    });
  }

  return { ok: true };
}

// Either side can walk it back: withdrawing one you sent, or removing someone
// you accepted. hi_del bounds it to your own rows. Deleting rather than setting
// a status keeps re-sending possible, which the unique index would otherwise
// block forever.
export async function removeRequest(requestId: string): Promise<Result> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("hi_requests").delete().eq("id", requestId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
