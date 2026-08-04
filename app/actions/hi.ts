"use server";

import { requireUser } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { sendFriendRequestEmail } from "@/lib/friendRequestEmail";

type Result = { ok: boolean; error?: string };

// What the two of you have in common, for the second line of the notification.
// Read from directory_profiles rather than profiles: interests are public
// roster data, so this works before anything is accepted and needs no
// service-role. Capped at two, since the line is a nudge, not a report.
async function sharedInterests(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  a: string,
  b: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("directory_profiles")
    .select("id, interests")
    .in("id", [a, b]);
  const rows = (data ?? []) as { id: string; interests: string[] | null }[];
  const mine = new Set((rows.find((r) => r.id === a)?.interests ?? []).map((i) => i.toLowerCase()));
  const theirs = rows.find((r) => r.id === b)?.interests ?? [];
  return theirs.filter((i) => mine.has(i.toLowerCase())).slice(0, 2);
}

// Friend requests. A request is a row in hi_requests; accepting it makes the two
// people a channel (migration 0023 widened shares_channel), which is what
// unlocks contacts and opens the direct thread. Everything here writes through
// the caller's own session so RLS is the real check, except the notifications,
// which are addressed to the other person and so need service-role.

export async function sendRequest(targetId: string): Promise<Result> {
  const { user, supabase } = await requireUser();
  if (targetId === user.id) return { ok: false, error: "That's you." };

  const { data: request, error } = await supabase
    .from("hi_requests")
    .insert({ from_user_id: user.id, to_user_id: targetId })
    .select("id")
    .single();
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

  const service = serviceClient();
  await service.from("notifications").insert({
    user_id: targetId,
    type: "hi_received",
    payload: {
      from_user_id: user.id,
      from_name: me?.name || "",
      shared: await sharedInterests(supabase, user.id, targetId),
    },
  });

  // Supabase Auth is the source of the recipient address; it is intentionally
  // never copied into the public profiles table. Transactional friend-request
  // email is best-effort so an email-provider outage cannot roll back a request
  // that already exists and is visible in the app.
  if (request) {
    const { data: recipient } = await service.auth.admin.getUserById(targetId);
    if (recipient.user?.email) {
      try {
        await sendFriendRequestEmail({
          recipientEmail: recipient.user.email,
          senderName: me?.name || "Someone",
        });
      } catch (emailError) {
        console.error("Friend request email failed", emailError);
      }
    }
  }

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
        shared: await sharedInterests(supabase, user.id, updated.from_user_id as string),
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
