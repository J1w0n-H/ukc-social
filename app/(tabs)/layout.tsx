import TabBar from "@/components/TabBar";
import GuestBanner from "@/components/GuestBanner";
import NotificationBell from "@/components/NotificationBell";
import { createServerSupabase } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";
import { conferenceDayStatus, formatConferenceDay } from "@/lib/conferenceDay";

export default async function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const conference = await getConference(supabase);
  const dayLabel = conference
    ? formatConferenceDay(
        conferenceDayStatus(conference, new Date().toISOString()),
        conference.name,
      )
    : null;

  const showBell = !!user && !user.is_anonymous;

  return (
    <>
      {user?.is_anonymous && <GuestBanner />}
      {/* The bell lives in the status bar rather than floating over it. Both
          used to be positioned independently, the bar sticky and the bell
          fixed at top 8px, so they only lined up by coincidence and did not:
          the bell sat 10px below the label and hung past the bar's bottom rule
          onto the page. Sharing one flex line makes them agree by
          construction. The empty span opposite the bell is what keeps the
          label centered on the bar instead of on the space left over beside
          it. */}
      {(dayLabel || showBell) && (
        <div className="day-status-bar">
          <span className="day-status-bar__side" aria-hidden />
          <span className="day-status-bar__label">{dayLabel}</span>
          <span className="day-status-bar__side">{showBell && <NotificationBell />}</span>
        </div>
      )}
      <main className="app-main">{children}</main>
      <TabBar />
    </>
  );
}
