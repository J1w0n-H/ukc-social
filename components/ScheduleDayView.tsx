"use client";

import { useState } from "react";
import type { ScheduleDay } from "@/lib/schedule";

// day.date is already a plain conference-local date, so format it in UTC.
const wdFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const dayNumFmt = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" });
const fullFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export default function ScheduleDayView({
  days,
  initialIndex,
  todayDate,
  nowIso,
  timezone,
}: {
  days: ScheduleDay[];
  initialIndex: number;
  todayDate: string | null;
  nowIso: string;
  timezone: string;
}) {
  const [index, setIndex] = useState(Math.max(0, initialIndex));
  const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
  const now = new Date(nowIso).getTime();

  if (days.length === 0) {
    return (
      <div className="board-card board-card--empty">
        <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>
          The conference schedule hasn&apos;t been posted yet — check back soon.
        </p>
      </div>
    );
  }

  const day = days[index];
  const isToday = day.date === todayDate;

  return (
    <div>
      {/* A row of date chips rather than prev/next arrows: every day of the
          conference is visible at once, you can jump straight to one, and there
          is no hidden "which day am I on" state. Scrolls horizontally so a
          longer conference degrades instead of squashing. */}
      <div className="day-chips" role="tablist" aria-label="Conference days">
        {days.map((d, i) => {
          const dt = new Date(`${d.date}T00:00:00Z`);
          const selected = i === index;
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`${fullFmt.format(dt)}${d.date === todayDate ? ", today" : ""}`}
              className="day-chip"
              onClick={() => setIndex(i)}
            >
              <span className="day-chip__wd">{wdFmt.format(dt)}</span>
              <span className="day-chip__d">{dayNumFmt.format(dt)}</span>
              {/* Always rendered so today's marker doesn't make one chip taller. */}
              <span
                className="day-chip__today"
                data-today={d.date === todayDate ? "true" : "false"}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {/* No min-height here on purpose. Item counts across the week are
          genuinely uneven (2 items on the 4th, 13 on the 6th), and padding the
          light days out to match only buys an empty box: those days already fit
          in the viewport without scrolling, so the reserved space does nothing.
          The date chips above are what keep you oriented. */}
      <div className="board-card" style={{ padding: 0 }}>
        {day.slots.map((slot, i) => {
          const current =
            isToday && now >= new Date(slot.starts_at).getTime() && now < new Date(slot.ends_at).getTime();
          return (
            <div
              key={`${slot.starts_at}|${slot.ends_at}`}
              style={{
                display: "flex",
                gap: 14,
                padding: "12px 16px",
                borderTop: i === 0 ? "none" : "1px solid var(--line)",
                background: current ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "none",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 84,
                  fontSize: 12,
                  color: current ? "var(--accent)" : "var(--ink-3)",
                  fontWeight: current ? 700 : 400,
                  paddingTop: 1,
                }}
              >
                {timeFmt.format(new Date(slot.starts_at))}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {slot.items.map((item) => (
                  <div
                    key={item.id}
                    className="sched-title"
                    title={item.title}
                    style={{ fontWeight: current ? 700 : 400 }}
                  >
                    {item.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .day-chips {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: none;
          margin-bottom: 12px;
        }
        .day-chips::-webkit-scrollbar { display: none; }
        .day-chip {
          flex: 1 0 auto;
          min-width: 56px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 8px 6px 6px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: none;
          color: var(--ink-2);
          cursor: pointer;
          transition: background 160ms ease-out, color 160ms ease-out, border-color 160ms ease-out;
        }
        .day-chip[aria-selected="true"] {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--accent-ink);
        }
        .day-chip__wd {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .day-chip__d { font-size: 16px; font-weight: 700; }
        .day-chip__today {
          width: 4px;
          height: 4px;
          border-radius: 999px;
          background: transparent;
        }
        .day-chip__today[data-today="true"] { background: var(--accent); }
        .day-chip[aria-selected="true"] .day-chip__today[data-today="true"] {
          background: var(--accent-ink);
        }

        /* Two lines then ellipsis. Every title in the current schedule fits
           inside two lines, so nothing is actually cut today. It caps the worst
           case, so one long title can't blow a row out to four lines and shift
           everything under it. Full text stays in the tooltip. */
        .sched-title {
          font-size: 14px;
          color: var(--ink);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          overflow: hidden;
        }

        @media (prefers-reduced-motion: reduce) {
          .day-chip { transition: none; }
        }
      `}</style>
    </div>
  );
}
