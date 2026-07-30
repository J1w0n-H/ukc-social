import { requireUser } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";
import { groupScheduleByDay, type ScheduleItem } from "@/lib/schedule";

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

  const dayFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC", // day.date is already a plain conference-local date
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  return (
    <section style={{ padding: "24px 20px" }}>
      <header className="page-head">
        <p className="page-kicker">{conference?.name ?? "Icebreaker"}</p>
        <h1 className="page-title">Home</h1>
        <p className="page-sub">Announcements and the conference schedule, in one place.</p>
      </header>

      <div style={{ marginTop: 8 }}>
        <div className="board-label">Announcement</div>
        <div className="board-card">
          <p style={{ fontSize: 15, color: "var(--ink)", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>
            {announcementBody}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div className="board-label">Schedule</div>
        {days.length === 0 ? (
          <div className="board-card board-card--empty">
            <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>
              The conference schedule hasn&apos;t been posted yet — check back soon.
            </p>
          </div>
        ) : (
          days.map((day) => (
            <div key={day.date} style={{ marginTop: 20 }}>
              <div className="board-day">{dayFmt.format(new Date(`${day.date}T00:00:00Z`))}</div>
              <div className="board-card" style={{ padding: 0 }}>
                {day.slots.map((slot, i) => (
                  <div
                    key={`${slot.starts_at}|${slot.ends_at}`}
                    style={{
                      display: "flex",
                      gap: 14,
                      padding: "12px 16px",
                      borderTop: i === 0 ? "none" : "1px solid var(--line)",
                    }}
                  >
                    <div style={{ flexShrink: 0, width: 84, fontSize: 12, color: "var(--ink-3)", paddingTop: 1 }}>
                      {timeFmt.format(new Date(slot.starts_at))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {slot.items.map((item) => (
                        <div key={item.id} style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.4 }}>
                          {item.title}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <style>{`
        .board-label {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink-3);
          margin-bottom: 8px;
        }
        .board-day {
          font-size: 13px;
          font-weight: 700;
          color: var(--ink-2);
          margin-bottom: 6px;
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
