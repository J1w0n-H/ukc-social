import { createClient } from "@supabase/supabase-js";

// The actual UKC 2026 schedule (Aug 4-8, America/New_York = UTC-4), from the
// conference program handed off directly. Flat rows — several rows sharing
// the same starts_at/ends_at are parallel tracks, grouped for display by
// lib/schedule.ts. sort_order controls left-to-right reading order among
// items in the same slot (matches the source program's column order).
const ITEMS: { starts_at: string; ends_at: string; title: string; sort_order?: number }[] = [
  // Tue 8/4 — SEED (pre-conference)
  { starts_at: "2026-08-04T11:00:00Z", ends_at: "2026-08-04T12:00:00Z", title: "Breakfast" },
  { starts_at: "2026-08-04T12:00:00Z", ends_at: "2026-08-04T22:45:00Z", title: "SEED" },

  // Wed 8/5 — SEED continues, then sponsor welcome dinner
  { starts_at: "2026-08-05T11:00:00Z", ends_at: "2026-08-05T12:00:00Z", title: "Breakfast" },
  { starts_at: "2026-08-05T12:00:00Z", ends_at: "2026-08-05T22:45:00Z", title: "SEED" },
  {
    starts_at: "2026-08-05T23:00:00Z",
    ends_at: "2026-08-06T01:00:00Z",
    title: "Sponsor Welcome Reception & Dinner (Invitation Only)",
  },

  // Thu 8/6
  { starts_at: "2026-08-06T11:00:00Z", ends_at: "2026-08-06T12:00:00Z", title: "Breakfast" },
  { starts_at: "2026-08-06T12:00:00Z", ends_at: "2026-08-06T14:00:00Z", title: "Opening / Plenary I" },
  { starts_at: "2026-08-06T14:00:00Z", ends_at: "2026-08-06T14:15:00Z", title: "Break" },
  { starts_at: "2026-08-06T14:15:00Z", ends_at: "2026-08-06T16:00:00Z", title: "Signature Symposiums" },
  { starts_at: "2026-08-06T16:00:00Z", ends_at: "2026-08-06T17:00:00Z", title: "Lunch" },
  { starts_at: "2026-08-06T17:00:00Z", ends_at: "2026-08-06T19:00:00Z", title: "Distinguished Sponsor Forums" },
  { starts_at: "2026-08-06T19:00:00Z", ends_at: "2026-08-06T19:15:00Z", title: "Break in the Exhibit Hall" },
  { starts_at: "2026-08-06T19:15:00Z", ends_at: "2026-08-06T21:00:00Z", title: "KSEA Forums", sort_order: 0 },
  { starts_at: "2026-08-06T19:15:00Z", ends_at: "2026-08-06T21:00:00Z", title: "IES opening", sort_order: 1 },
  { starts_at: "2026-08-06T21:00:00Z", ends_at: "2026-08-06T22:45:00Z", title: "TG Symposiums", sort_order: 0 },
  { starts_at: "2026-08-06T21:00:00Z", ends_at: "2026-08-06T22:45:00Z", title: "FIRE", sort_order: 1 },
  { starts_at: "2026-08-06T21:00:00Z", ends_at: "2026-08-06T22:45:00Z", title: "IES", sort_order: 2 },
  { starts_at: "2026-08-06T23:00:00Z", ends_at: "2026-08-07T01:00:00Z", title: "Gala Dinner" },

  // Fri 8/7
  { starts_at: "2026-08-07T11:00:00Z", ends_at: "2026-08-07T12:00:00Z", title: "Breakfast" },
  {
    starts_at: "2026-08-07T12:00:00Z",
    ends_at: "2026-08-07T14:00:00Z",
    title: "Plenary II, Fireside chat with Chris A. Malachowsky",
  },
  { starts_at: "2026-08-07T14:00:00Z", ends_at: "2026-08-07T14:15:00Z", title: "Break" },
  { starts_at: "2026-08-07T14:15:00Z", ends_at: "2026-08-07T16:00:00Z", title: "Sponsor Forums" },
  { starts_at: "2026-08-07T16:00:00Z", ends_at: "2026-08-07T17:00:00Z", title: "Lunch" },
  { starts_at: "2026-08-07T17:00:00Z", ends_at: "2026-08-07T19:00:00Z", title: "KSEA Forums" },
  { starts_at: "2026-08-07T19:00:00Z", ends_at: "2026-08-07T19:15:00Z", title: "Break in the Exhibit Hall" },
  { starts_at: "2026-08-07T19:15:00Z", ends_at: "2026-08-07T21:00:00Z", title: "TG Symposiums", sort_order: 0 },
  { starts_at: "2026-08-07T19:15:00Z", ends_at: "2026-08-07T21:00:00Z", title: "FIRE", sort_order: 1 },
  { starts_at: "2026-08-07T19:15:00Z", ends_at: "2026-08-07T21:00:00Z", title: "IES", sort_order: 2 },
  { starts_at: "2026-08-07T21:00:00Z", ends_at: "2026-08-07T22:45:00Z", title: "Posters", sort_order: 0 },
  { starts_at: "2026-08-07T21:00:00Z", ends_at: "2026-08-07T22:45:00Z", title: "IES SPC", sort_order: 1 },
  { starts_at: "2026-08-07T23:00:00Z", ends_at: "2026-08-08T01:00:00Z", title: "Networking Dinner" },

  // Sat 8/8
  { starts_at: "2026-08-08T11:00:00Z", ends_at: "2026-08-08T12:00:00Z", title: "Breakfast" },
  { starts_at: "2026-08-08T12:00:00Z", ends_at: "2026-08-08T14:00:00Z", title: "TG Symposiums/ FIRE" },
  { starts_at: "2026-08-08T14:15:00Z", ends_at: "2026-08-08T16:00:00Z", title: "Closing / Plenary III" },
];

// ponytail: run with env loaded, e.g. `npx -y tsx --env-file=.env.local scripts/seed-schedule.ts`
async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: existing, error } = await supabase
    .from("schedule_items")
    .select("title, starts_at");
  if (error) throw error;

  // title+starts_at, not title alone — the same title (e.g. "Breakfast",
  // "Lunch") legitimately repeats across different days/times.
  const have = new Set((existing ?? []).map((r) => `${r.title}|${r.starts_at}`));
  const missing = ITEMS.filter((i) => !have.has(`${i.title}|${i.starts_at}`)).map((i) => ({
    starts_at: i.starts_at,
    ends_at: i.ends_at,
    title: i.title,
    sort_order: i.sort_order ?? 0,
  }));

  if (missing.length) {
    const { error: insErr } = await supabase.from("schedule_items").insert(missing);
    if (insErr) throw insErr;
  }

  console.log(`${ITEMS.length} schedule items (${missing.length} inserted)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
