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

  return (
    <>
      {user?.is_anonymous && <GuestBanner />}
      {dayLabel && <div className="day-status-bar">{dayLabel}</div>}
      {user && !user.is_anonymous && (
        <div className="notif-slot">
          <NotificationBell />
        </div>
      )}
      <main className="app-main">{children}</main>
      <TabBar />
    </>
  );
}
