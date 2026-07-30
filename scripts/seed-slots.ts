import { createClient } from "@supabase/supabase-js";

// Dev/local convenience only — in production, slots are derived automatically
// from the registered conference's own dates (lib/slots.ts's deriveSlots,
// wired into app/actions/conference.ts's upsertConference). This script just
// seeds the same real UKC 2026 dates directly, without going through /admin,
// for quick local setup. Times are America/New_York (EDT = UTC-4), written as
// explicit UTC ISO strings.
const SLOTS = [
  {
    title: "Day 1 Dinner",
    starts_at: "2026-08-05T23:00:00Z",
    area: "ChampionsGate",
    join_deadline: "2026-08-05T21:00:00Z",
    kind: "meal",
  },
  {
    title: "Day 2 Dinner",
    starts_at: "2026-08-06T23:00:00Z",
    area: "ChampionsGate",
    join_deadline: "2026-08-06T21:00:00Z",
    kind: "meal",
  },
  {
    title: "Day 3 Dinner",
    starts_at: "2026-08-07T23:00:00Z",
    area: "ChampionsGate",
    join_deadline: "2026-08-07T21:00:00Z",
    kind: "meal",
  },
  {
    title: "Farewell Lunch",
    starts_at: "2026-08-08T16:30:00Z",
    area: "Near the resort",
    join_deadline: "2026-08-08T14:30:00Z",
    kind: "meal",
  },
];

// ponytail: run with env loaded, e.g. `npx -y tsx --env-file=.env.local scripts/seed-slots.ts`
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: existing, error } = await supabase.from("slots").select("title");
  if (error) throw error;

  const have = new Set((existing ?? []).map((s) => s.title));
  const missing = SLOTS.filter((s) => !have.has(s.title));

  if (missing.length) {
    const { error: insErr } = await supabase.from("slots").insert(missing);
    if (insErr) throw insErr;
  }

  console.log(`${SLOTS.length} slots (${missing.length} inserted)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
