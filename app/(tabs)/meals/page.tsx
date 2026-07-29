import { requireUser } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";
import MealsList from "@/components/MealsList";

// Just the data-dependent list — shared by the standalone /meals route and the
// combined /matching (Meals | Rides) tab, so both read from one implementation.
export async function MealsListSection() {
  const { user, supabase } = await requireUser();
  const conference = await getConference(supabase);

  const { data: slots } = await supabase
    .from("slots")
    .select("id, title, starts_at, area, join_deadline")
    .eq("kind", "meal")
    .order("starts_at");

  const { data: signups } = await supabase
    .from("signups")
    .select("slot_id, user_id, party_size, notes");

  // "N people in" counts real seats: a party of 3 counts as 3.
  const counts: Record<string, number> = {};
  const mine: Record<string, { partySize: number; notes: string }> = {};
  for (const s of signups ?? []) {
    counts[s.slot_id] = (counts[s.slot_id] ?? 0) + (s.party_size ?? 1);
    if (s.user_id === user.id) {
      mine[s.slot_id] = { partySize: s.party_size ?? 1, notes: s.notes ?? "" };
    }
  }

  if (!slots?.length) {
    return (
      <p style={{ color: "var(--ink-2)", fontSize: 15, paddingTop: 8 }}>
        Slots open soon.
      </p>
    );
  }
  return (
    <MealsList
      slots={slots}
      counts={counts}
      mine={mine}
      nowMs={Date.now()}
      isGuest={!!user.is_anonymous}
      timezone={conference?.timezone}
    />
  );
}

export default async function MealsPage() {
  const supabase = (await requireUser()).supabase;
  const conference = await getConference(supabase);

  return (
    <section style={{ padding: "24px 20px" }}>
      <header className="page-head">
        <p className="page-kicker">{conference?.name ?? "Meals"}</p>
        <h1 className="page-title">Meals</h1>
        <p className="page-sub">Grab dinner with people worth meeting.</p>
      </header>

      <MealsListSection />
    </section>
  );
}
