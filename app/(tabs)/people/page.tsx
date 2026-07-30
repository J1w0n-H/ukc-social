import { requireUser } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";
import PeopleBrowser from "@/components/PeopleBrowser";

export default async function PeoplePage() {
  const { user, supabase } = await requireUser();
  const conference = await getConference(supabase);

  // stay_start/stay_end may not exist yet (migration 0009 pending) → degrade
  // to no stay data rather than erroring the whole page.
  const { data: people, error } = await supabase
    .from("directory_profiles")
    .select("id, name, photo_url, school, position, interests, bio, stay_start, stay_end")
    .order("name");
  let rows = people ?? [];
  if (error) {
    const fallback = await supabase
      .from("directory_profiles")
      .select("id, name, photo_url, school, position, interests, bio")
      .order("name");
    rows = (fallback.data ?? []).map((p) => ({ ...p, stay_start: null, stay_end: null }));
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("stay_start, stay_end")
    .eq("id", user.id)
    .maybeSingle();

  const { data: sentRows } = await supabase
    .from("hi_requests")
    .select("to_user_id")
    .eq("from_user_id", user.id);
  const hiSent = (sentRows ?? []).map((r) => r.to_user_id as string);

  return (
    <section style={{ padding: "24px 20px" }}>
      <header className="page-head">
        <p className="page-kicker">{conference?.name ?? "Icebreaker"}</p>
        <h1 className="page-title">People</h1>
        <p className="page-sub">Everyone here this week.</p>
      </header>
      <PeopleBrowser
        people={rows}
        meId={user.id}
        isGuest={!!user.is_anonymous}
        myStay={{ start: me?.stay_start ?? null, end: me?.stay_end ?? null }}
        hiSent={hiSent}
      />
    </section>
  );
}
