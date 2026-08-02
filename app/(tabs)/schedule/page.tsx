import { requireUser } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";
import { groupScheduleByDay, currentDayIndex, type ScheduleItem } from "@/lib/schedule";
import ScheduleDayView from "@/components/ScheduleDayView";

export default async function BoardPage() {
  const { supabase } = await requireUser();
  const conference = await getConference(supabase);
  const timezone = conference?.timezone ?? "America/New_York";

  const announcementBody =
    conference?.announcement?.trim() || `Welcome to ${conference?.name ?? "Icebreaker"}! 👋`;

  const { data: rows } = await supabase
    .from("schedule_items")
    .select("id, starts_at, ends_at, title, sort_order")
    .order("starts_at");
  const items = (rows ?? []) as ScheduleItem[];
  const days = groupScheduleByDay(items, timezone);

  const nowIso = new Date().toISOString();
  const todayDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(nowIso));
  const initialIndex = currentDayIndex(days, todayDate);

  return (
    <section style={{ padding: "24px 20px" }}>
      <header className="page-head">
        <p className="page-kicker">{conference?.name ?? "Icebreaker"}</p>
        <h1 className="page-title">Schedule</h1>
      </header>

      <div style={{ marginTop: 8 }}>
        <div className="board-label">Announcement</div>
        <div className="board-card">
          <p style={{ fontSize: 15, color: "var(--ink)", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>
            {announcementBody}
          </p>
        </div>
      </div>

      {/* No "Schedule" section label here: the page is already titled Schedule,
          and the date chips make it obvious what follows. */}
      <div style={{ marginTop: 28 }}>
        <ScheduleDayView
          days={days}
          initialIndex={initialIndex}
          todayDate={days.length ? todayDate : null}
          nowIso={nowIso}
          timezone={timezone}
        />
      </div>

      <style>{`
        .board-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink-3);
          margin-bottom: 8px;
        }
        .board-card {
          padding: 16px;
          border: 1px solid var(--line);
          border-radius: 14px;
        }
        .board-card--empty {
          text-align: center;
          padding: 28px 16px;
        }
      `}</style>
    </section>
  );
}
