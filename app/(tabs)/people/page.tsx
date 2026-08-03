import { requireUser } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";
import PeopleBrowser from "@/components/PeopleBrowser";
import PeopleChatTabs from "@/components/PeopleChatTabs";
import { ChatListSection } from "../chat/page";

// Just the data-dependent browser — shared by the standalone /people route
// and the 친구 (Home) tab, which embeds it directly (see app/(tabs)/home/page.tsx).
export async function PeopleSection() {
  const { user, supabase } = await requireUser();

  // Only people who have actually filled in a name. An account can exist from
  // the moment it signs in, well before onboarding is finished, and those rows
  // were listing as "Someone" with no school, position or interests: a row you
  // cannot recognise, filter on, or say hi to with any idea who you are
  // greeting. They come back the moment a name is saved.
  //
  // Filtered here rather than in the directory_profiles view, because the view
  // also resolves member names for tables (홈) and rides. Hiding a nameless row
  // there would drop that person out of their own ride roster, which is worse
  // than showing a placeholder.
  //
  // stay_start/stay_end may not exist yet (migration 0009 pending) → degrade
  // to no stay data rather than erroring the whole page.
  const { data: people, error } = await supabase
    .from("directory_profiles")
    .select("id, name, photo_url, school, position, interests, bio, stay_start, stay_end")
    .neq("name", "")
    .order("name");
  let rows = people ?? [];
  if (error) {
    const fallback = await supabase
      .from("directory_profiles")
      .select("id, name, photo_url, school, position, interests, bio")
      .neq("name", "")
      .order("name");
    rows = (fallback.data ?? []).map((p) => ({ ...p, stay_start: null, stay_end: null }));
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("stay_start, stay_end")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <PeopleBrowser
      people={rows}
      meId={user.id}
      myStay={{ start: me?.stay_start ?? null, end: me?.stay_end ?? null }}
    />
  );
}

// The second tab in the bar. Holds the people browser and the chat list behind
// one segment control, the same arrangement /matching uses for Meals | Rides.
// People had no tab of its own before and was reachable only through 홈's
// "Meet other participants" row, so it leads here; ?tab=chat opens the other
// half directly.
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = (await requireUser()).supabase;
  const [{ tab }, conference, people, chat] = await Promise.all([
    searchParams,
    getConference(supabase),
    PeopleSection(),
    ChatListSection(),
  ]);

  return (
    <PeopleChatTabs
      kicker={conference?.name ?? "Icebreaker"}
      people={people}
      chat={chat.node}
      unread={chat.unread}
      initialTab={tab === "chat" ? "chat" : "people"}
    />
  );
}
