"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  type: "table_revealed" | "ride_matched" | "hi_received" | "new_message" | "announcement" | "ride_member_left" | "friend_accepted";
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

// Where each notification lands. Two rules behind these:
//
// "Your table is set" goes to the reveal screen, not straight into the chat.
// The reveal is the only place that answers who you're sitting with and why you
// were put together, and it carries the icebreaker question. Dropping someone
// into a silent thread with five strangers skips exactly the context that makes
// the first message possible.
//
// Anything ride-shaped goes to 매칭 with the Rides segment already open. A new
// ride message opens the thread itself, the same as a table message does, rather
// than the list it came from.

// The actor's name. Notifications written since app/actions/hi.ts started
// storing it carry from_name; older ones carry only from_user_id, so those are
// looked up once from the roster and passed in here. "Someone" is the last
// resort, for a row with neither.
const who = (
  p: Record<string, unknown>,
  names?: Map<string, string>,
  fallback = "Someone",
) => {
  if (typeof p.from_name === "string" && p.from_name.trim()) return p.from_name.trim();
  const id = typeof p.from_user_id === "string" ? p.from_user_id : null;
  return (id && names?.get(id)) || fallback;
};

// The second line, and only when there is something true to say. A shared
// interest is written into the payload when the notification fires (see
// app/actions/hi.ts); when the two of you have none in common the line is
// simply absent rather than padded with something generic.
const sharedLine = (p: Record<string, unknown>): string | null => {
  const shared = Array.isArray(p.shared) ? (p.shared as unknown[]).filter((x) => typeof x === "string") : [];
  if (shared.length === 0) return null;
  if (shared.length === 1) return `You are both into ${shared[0]}.`;
  return `You are both into ${shared[0]} and ${shared[1]}.`;
};

const COPY: Record<
  Notification["type"],
  {
    text: (p: Record<string, unknown>, names?: Map<string, string>) => string;
    sub?: (p: Record<string, unknown>) => string | null;
    href: (p: Record<string, unknown>) => string;
  }
> = {
  table_revealed: { text: () => "Your table is set. Say hi.", href: (p) => `/groups/${p.group_id}` },
  ride_matched: { text: () => "Someone joined your ride.", href: () => "/matching?tab=rides" },
  hi_received: {
    text: (p, names) => `${who(p, names)} requested you as a friend.`,
    sub: sharedLine,
    href: () => "/people",
  },
  friend_accepted: {
    text: (p, names) => `You just connected with ${who(p, names)}.`,
    sub: sharedLine,
    // Notifications written before migration 0024 carry only request_id. That
    // path still resolves, it just redirects, so old rows keep working.
    href: (p) => (p.slug ? `/dm/${p.slug}` : `/friends/${p.request_id}/chat`),
  },
  new_message: {
    text: () => "New message.",
    href: (p) =>
      p.channel_type === "meal"
        ? `/groups/${p.channel_id}/chat`
        : `/rides/${p.channel_id}/chat`,
  },
  announcement: { text: () => "New announcement.", href: () => "/schedule" },
  ride_member_left: { text: () => "Someone left your ride.", href: () => "/matching?tab=rides" },
};

export default function NotificationBell() {
  const supabase = useRef(createClient()).current;
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.read_at).length;
  const pathname = usePathname();
  // Names for older notifications whose payload predates from_name. Read from
  // directory_profiles, which is public roster data, so this needs no special
  // grant and works for a request you have not accepted.
  const [names, setNames] = useState<Map<string, string>>(new Map());

  // Close on navigation. Following a notification already closed the panel,
  // but the bell lives in the status bar and so outlives every page under it:
  // opening it and then tapping a tab left it hanging over the screen you had
  // just moved to, with no obvious way back except the bell itself.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    let active = true;
    // Held outside the async body so the effect's own cleanup can reach it.
    // Returning a cleanup from the inner function only returns it to the
    // function, and React never sees it.
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data } = await supabase
        .from("notifications")
        .select("id, type, payload, read_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      const rows = (data as Notification[]) ?? [];
      if (active) setItems(rows);

      const missing = [
        ...new Set(
          rows
            .filter((n) => !n.payload.from_name && typeof n.payload.from_user_id === "string")
            .map((n) => n.payload.from_user_id as string),
        ),
      ];
      if (missing.length) {
        const { data: profs } = await supabase
          .from("directory_profiles")
          .select("id, name")
          .in("id", missing);
        if (active && profs) {
          setNames(new Map(profs.map((p) => [p.id as string, p.name as string])));
        }
      }

      if (!active) return;
      channel = supabase
        .channel(`notif-${user.id}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
          (payload) => {
            const n = payload.new as Notification;
            setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
          },
        )
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markAllRead() {
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => setOpen((v) => !v)}
        className="notif-bell"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4.5a5 5 0 0 0-5 5v3.2c0 .6-.2 1.2-.6 1.7L5 16h14l-1.4-1.6a2.7 2.7 0 0 1-.6-1.7V9.5a5 5 0 0 0-5-5Z" />
          <path d="M10 18.5a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && <span className="notif-dot" aria-hidden />}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel__head">
            <span>Notifications</span>
            {unread > 0 && (
              <button type="button" className="notif-markread" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="notif-empty">Nothing yet.</p>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                href={COPY[n.type].href(n.payload)}
                className="notif-row"
                onClick={() => setOpen(false)}
                style={{ opacity: n.read_at ? 0.6 : 1 }}
              >
                <span className="notif-line">{COPY[n.type].text(n.payload, names)}</span>
                {COPY[n.type].sub?.(n.payload) && (
                  <span className="notif-sub">{COPY[n.type].sub!(n.payload)}</span>
                )}
              </Link>
            ))
          )}
        </div>
      )}

      <style>{`
        .notif-bell {
          position: relative;
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          border: none;
          background: none;
          color: var(--ink-2);
          cursor: pointer;
        }
        .notif-dot {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--danger, #e8788a);
        }
        .notif-panel {
          position: absolute;
          top: 46px;
          right: 0;
          width: 280px;
          max-height: 340px;
          overflow-y: auto;
          background: var(--surface, #101B27);
          border: 1px solid var(--line);
          border-radius: 14px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.4);
          z-index: 60;
          padding: 6px 0;
        }
        .notif-panel__head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 700;
          color: var(--ink);
        }
        .notif-markread {
          background: none;
          border: none;
          color: var(--accent);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .notif-empty {
          padding: 16px 14px;
          font-size: 13px;
          color: var(--ink-3);
        }
        .notif-line { display: block; }
        .notif-sub {
          display: block;
          margin-top: 2px;
          font-size: 12px;
          color: var(--ink-2);
        }
        .notif-row {
          display: block;
          padding: 10px 14px;
          font-size: 13px;
          color: var(--ink);
          text-decoration: none;
          border-top: 1px solid var(--line);
        }
        .notif-row:first-of-type { border-top: none; }
      `}</style>
    </div>
  );
}
