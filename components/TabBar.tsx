"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: React.ReactNode };

// KakaoTalk-style IA: grouped by relationship, not by feature (Meals/Rides/People/Me).
// Icon-only, no .tabbar__label.
//
// 홈 is the connector and sits in the middle: your status, your tables, your ride,
// and one line of what's next. 일정 is the read-only conference program (the
// announcement plus the full agenda). It used to be /board and used to be labeled
// 홈, which is why the old route name and the old label disagreed.
// 친구 holds the people directory and the chat list behind one segment control,
// the same arrangement 매칭 uses for Meals and Rides. People used to have no tab
// at all and was reachable only through 홈's "Meet other participants" row, which
// made the one screen about meeting people the hardest one to find. It leads
// now; /people?tab=chat opens the conversation list.
const tabs: Tab[] = [
  {
    href: "/schedule",
    label: "일정",
    icon: (
      <path d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6ZM8 3v4M16 3v4M4 10h16" />
    ),
  },
  {
    href: "/people",
    label: "친구",
    icon: (
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM22 20v-1.5a4 4 0 0 0-3-3.87M16 3.63a4 4 0 0 1 0 7.75" />
    ),
  },
  {
    href: "/home",
    label: "홈",
    icon: (
      <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
    ),
  },
  {
    href: "/matching",
    label: "매칭",
    icon: (
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    ),
  },
  {
    href: "/me",
    label: "마이페이지",
    icon: <path d="M4 6h16M4 12h16M4 18h16" />,
  },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav className="tabbar" aria-label="Main navigation">
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="tabbar__item"
            aria-current={active ? "page" : undefined}
            aria-label={tab.label}
            style={{ color: active ? "var(--accent)" : "var(--ink-3)" }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {tab.icon}
            </svg>
          </Link>
        );
      })}

      <style>{`
        .tabbar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 50;
          display: flex;
          justify-content: space-around;
          padding-bottom: env(safe-area-inset-bottom);
          background: var(--glass);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border-top: 1px solid var(--glass-line);
        }
        .tabbar__item {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px 0 16px;
          text-decoration: none;
          transition: color 180ms ease-out;
        }
        @media (prefers-reduced-transparency: reduce) {
          .tabbar {
            background: var(--glass-solid);
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .tabbar__item {
            transition: none;
          }
        }
        /* Desktop web layout: the same tab list, laid out as a left icon rail
           instead of a bottom bar. No forked component or logic, just a second
           CSS-driven arrangement. 마이페이지 (last item) gets pushed to the
           bottom via margin-top: auto, leaving room above it for
           NotificationBell (positioned separately, see app/globals.css). */
        @media (min-width: 1024px) {
          .tabbar {
            /* Below the day bar, not under it. The bar is sticky, full width
               and z-index 55, so a rail starting at 0 had its first icon cut
               in half by it, and that icon is the active tab on the first
               screen people land on. */
            top: calc(var(--statusbar-h) + env(safe-area-inset-top));
            bottom: 0;
            right: auto;
            width: 64px;
            flex-direction: column;
            justify-content: flex-start;
            padding: 20px 0;
            border-top: none;
            border-right: 1px solid var(--glass-line);
          }
          .tabbar__item {
            flex: 0 0 auto;
            padding: 14px 0;
          }
          /* :last-of-type, not :last-child. The inline style element below is
             the real last child of .tabbar, so :last-child matched nothing.
             Do not write that tag name literally here: the server escapes a
             bare angle bracket inside style content and the client does not,
             which mismatches hydration on every page the tab bar renders on. */
          a.tabbar__item:last-of-type {
            margin-top: auto;
          }
        }
      `}</style>
    </nav>
  );
}
