"use client";

import { useState } from "react";
import type { ScheduleDay } from "@/lib/schedule";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC", // day.date is already a plain conference-local date
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
      <div className="day-nav">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label="Previous day"
          className="day-nav__btn"
        >
          ‹
        </button>
        <div className="day-nav__label">
          {dayFmt.format(new Date(`${day.date}T00:00:00Z`))}
          {isToday && <span className="day-nav__today">Today</span>}
        </div>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(days.length - 1, i + 1))}
          disabled={index === days.length - 1}
          aria-label="Next day"
          className="day-nav__btn"
        >
          ›
        </button>
      </div>

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
                    style={{
                      fontSize: 14,
                      color: "var(--ink)",
                      fontWeight: current ? 700 : 400,
                      lineHeight: 1.4,
                    }}
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
        .day-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .day-nav__btn {
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: none;
          color: var(--ink);
          font-size: 18px;
          cursor: pointer;
        }
        .day-nav__btn:disabled { opacity: 0.3; cursor: default; }
        .day-nav__label {
          font-size: 15px;
          font-weight: 700;
          color: var(--ink);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .day-nav__today {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--accent-ink);
          background: var(--accent);
          padding: 2px 8px;
          border-radius: 999px;
        }
      `}</style>
    </div>
  );
}
