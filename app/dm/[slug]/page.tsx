import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import Chat from "@/components/Chat";

// A direct thread between two people who accepted each other's request.
//
// Addressed by the request's slug rather than its uuid, purely so the URL reads
// as /dm/V1StGXR8Z5. The channel is still keyed by the uuid underneath: that is
// what messages.channel_id holds and what is_accepted_friend_channel checks, so
// no message rows moved and the slug never leaves this file.
export default async function DirectChatPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, supabase } = await requireUser();

  // hi_sel limits this to rows you are a party to, so someone else's thread is
  // already null here rather than something to check for. The accepted filter is
  // ours: a pending or declined request is not a thread.
  const { data: req } = await supabase
    .from("hi_requests")
    .select("id, from_user_id, to_user_id, status")
    .eq("slug", slug)
    .eq("status", "accepted")
    .maybeSingle();
  if (!req) notFound();

  const otherId = req.from_user_id === user.id ? req.to_user_id : req.from_user_id;

  // Readable because accepting made the two of you a channel, which is the same
  // thing that unlocked contacts (shares_channel, widened in 0023).
  const { data: other } = await supabase
    .from("profiles")
    .select("name, photo_url")
    .eq("id", otherId)
    .maybeSingle();
  const { data: me } = await supabase
    .from("profiles")
    .select("name, photo_url")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <Chat
      channelType="direct"
      channelId={req.id}
      currentUserId={user.id}
      groupId={req.id}
      groupName={other?.name || "Someone"}
      members={[
        { userId: user.id, name: me?.name || "You", photo_url: me?.photo_url ?? null },
        { userId: otherId, name: other?.name || "Someone", photo_url: other?.photo_url ?? null },
      ]}
      starterQuestion={null}
      meetTime={null}
    />
  );
}
