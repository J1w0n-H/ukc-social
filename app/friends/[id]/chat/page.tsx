import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";

// The thread used to live here, addressed by the request's uuid. It moved to
// /dm/<slug> (migration 0024). This stays because friend_accepted notifications
// already sitting in the database carry the old path, and a notification that
// 404s is worse than one extra hop.
export default async function LegacyFriendChatRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: req } = await supabase
    .from("hi_requests")
    .select("slug")
    .eq("id", id)
    .eq("status", "accepted")
    .maybeSingle();
  if (!req) notFound();

  redirect(`/dm/${req.slug}`);
}
