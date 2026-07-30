import { requireUser } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";

// Placeholder for the 홈 tab (step 1 of the announcements+schedule build —
// admin input comes next, then wiring the schedule to what admin enters).
// Locks in the eventual "no announcement -> default to a welcome message"
// behavior now, so swapping in a real announcements source later is a
// drop-in change rather than a rewrite.
export default async function BoardPage() {
  const { supabase } = await requireUser();
  const conference = await getConference(supabase);

  const announcement: string | null = null;
  const announcementBody = announcement ?? `Welcome to ${conference?.name ?? "Icebreaker"}! 👋`;

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
          <p style={{ fontSize: 15, color: "var(--ink)", lineHeight: 1.5, margin: 0 }}>
            {announcementBody}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <div className="board-label">Schedule</div>
        <div className="board-card board-card--empty">
          <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>
            The conference schedule hasn&apos;t been posted yet — check back soon.
          </p>
        </div>
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
