import TabBar from "@/components/TabBar";
import GuestBanner from "@/components/GuestBanner";
import NotificationBell from "@/components/NotificationBell";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      {user?.is_anonymous && <GuestBanner />}
      {user && !user.is_anonymous && (
        <div style={{ position: "fixed", top: 8, right: 8, zIndex: 55 }}>
          <NotificationBell />
        </div>
      )}
      <main style={{ paddingBottom: 88 }}>{children}</main>
      <TabBar />
    </>
  );
}
