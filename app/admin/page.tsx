import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/isAdmin";
import { getConference } from "@/lib/conference";
import AdminSlotRow from "@/components/AdminSlotRow";
import AdminConferenceForm from "@/components/AdminConferenceForm";
import AdminScheduleForm from "@/components/AdminScheduleForm";
import AdminOpenAIHealth from "@/components/AdminOpenAIHealth";

export default async function AdminPage() {
  const { user, supabase } = await requireUser();
  if (!(await isAdmin(user))) notFound();

  const conference = await getConference(supabase);

  const { data: slots } = await supabase
    .from("slots")
    .select("id, title, starts_at")
    .order("starts_at");
  const dtf = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: conference?.timezone ?? "America/New_York",
  });
  const { data: signups } = await supabase.from("signups").select("slot_id");

  const { data: scheduleItems } = await supabase
    .from("schedule_items")
    .select("id, starts_at, ends_at, title, sort_order")
    .order("starts_at");

  const counts = new Map<string, number>();
  for (const s of signups ?? [])
    counts.set(s.slot_id as string, (counts.get(s.slot_id as string) ?? 0) + 1);

  return (
    <section style={{ padding: "24px 20px", maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 600 }}>Admin · Matching</h1>
      <p style={{ color: "var(--ink-2)", margin: "8px 0 20px" }}>
        Run interest matching per slot. Safe to re-run: it seats whoever is not at a table
        yet and leaves existing tables and their chats alone. A handful of leftovers are held
        back until there are enough of them to fill a table.
      </p>

      <AdminOpenAIHealth />

      <AdminConferenceForm conference={conference} />

      <AdminScheduleForm
        items={(scheduleItems ?? []) as { id: string; starts_at: string; ends_at: string; title: string; sort_order: number }[]}
        timezone={conference?.timezone ?? "America/New_York"}
        utcOffset={conference?.utc_offset ?? "-04:00"}
      />

      <div style={{ borderTop: "1px solid var(--line)" }}>
        {(slots ?? []).map((slot) => (
          <AdminSlotRow
            key={slot.id as string}
            slotId={slot.id as string}
            title={slot.title as string}
            when={dtf.format(new Date(slot.starts_at as string))}
            count={counts.get(slot.id as string) ?? 0}
          />
        ))}
        {!slots?.length && (
          <p style={{ color: "var(--ink-3)", padding: "16px 0" }}>No slots yet.</p>
        )}
      </div>
    </section>
  );
}
