"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

type SentMessage = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type Result = { ok: boolean; error?: string; message?: SentMessage };

export async function sendMessage(
  channelType: "meal" | "ride",
  channelId: string,
  body: string,
): Promise<Result> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Message is empty" };
  if (trimmed.length > 2000) return { ok: false, error: "Message too long" };

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  // RLS enforces channel membership on insert.
  const { data, error } = await supabase
    .from("messages")
    .insert({
      channel_type: channelType,
      channel_id: channelId,
      user_id: user.id,
      body: trimmed,
    })
    .select("id, user_id, body, created_at")
    .single();
  if (error) return { ok: false, error: error.message };

  // Notify the other channel members — the sender isn't the caller's own
  // session for most of them, so this needs the service-role client, same
  // as matchOneSlot/joinRide's notification writes. Collapsed: skip anyone
  // who already has an unread new_message notification for this channel,
  // so an active back-and-forth doesn't spam one row per message.
  const svc = serviceClient();
  const memberTable = channelType === "meal" ? "group_members" : "ride_members";
  const memberIdColumn = channelType === "meal" ? "group_id" : "pool_id";
  const { data: members } = await svc.from(memberTable).select("user_id").eq(memberIdColumn, channelId);
  const others = (members ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id !== user.id);

  if (others.length) {
    const { data: alreadyNotified } = await svc
      .from("notifications")
      .select("user_id")
      .eq("type", "new_message")
      .is("read_at", null)
      .eq("payload->>channel_id", channelId)
      .in("user_id", others);
    const skip = new Set((alreadyNotified ?? []).map((n) => n.user_id as string));
    const toNotify = others.filter((id) => !skip.has(id));
    if (toNotify.length) {
      await svc.from("notifications").insert(
        toNotify.map((uid) => ({
          user_id: uid,
          type: "new_message" as const,
          payload: { channel_type: channelType, channel_id: channelId },
        })),
      );
    }
  }

  return { ok: true, message: data as SentMessage };
}
