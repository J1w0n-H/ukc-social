"use client";

import { useState, useTransition } from "react";
import { upsertScheduleItem, deleteScheduleItem } from "@/app/actions/schedule";
import { groupScheduleByDay, type ScheduleItem } from "@/lib/schedule";

function toIso(localDateTime: string, utcOffset: string): string {
  return new Date(`${localDateTime}:00${utcOffset}`).toISOString();
}

// day.date is already a plain YYYY-MM-DD in the conference's timezone (see
// lib/schedule.ts) — format it as UTC so no further timezone shift is
// applied on top of that.
const dayFmt = () =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const timeFmt = (timezone: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });

export default function AdminScheduleForm({
  items,
  timezone,
  utcOffset,
}: {
  items: ScheduleItem[];
  timezone: string;
  utcOffset: string;
}) {
  const days = groupScheduleByDay(items, timezone);
  const tfmt = timeFmt(timezone);
  const dfmt = dayFmt();

  const [form, setForm] = useState({ starts_at: "", ends_at: "", title: "", sort_order: 0 });
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function add() {
    setResult(null);
    startTransition(async () => {
      const r = await upsertScheduleItem({
        starts_at: toIso(form.starts_at, utcOffset),
        ends_at: toIso(form.ends_at, utcOffset),
        title: form.title.trim(),
        sort_order: Number(form.sort_order) || 0,
      });
      if (r.ok) {
        setForm({ starts_at: "", ends_at: "", title: "", sort_order: 0 });
      }
      setResult(r.ok ? "Added." : `error: ${r.error}`);
    });
  }

  function remove(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      await deleteScheduleItem(id);
      setDeletingId(null);
    });
  }

  return (
    <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: 20, marginBottom: 20 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Schedule</h2>
      <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 14 }}>
        Shown on 홈. Rows with the same start/end time are grouped together as
        parallel sessions.
      </p>

      {days.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>No schedule items yet.</p>
      ) : (
        days.map((day) => (
          <div key={day.date} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-2)" }}>
              {dfmt.format(new Date(`${day.date}T00:00:00Z`))}
            </div>
            {day.slots.map((slot) => (
              <div key={`${slot.starts_at}|${slot.ends_at}`} style={{ display: "flex", gap: 10, padding: "6px 0", alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, width: 130, fontSize: 12, color: "var(--ink-3)", paddingTop: 2 }}>
                  {tfmt.format(new Date(slot.starts_at))} – {tfmt.format(new Date(slot.ends_at))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {slot.items.map((it) => (
                    <div key={it.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
                      <span>{it.title}</span>
                      <button
                        type="button"
                        onClick={() => remove(it.id)}
                        disabled={pending && deletingId === it.id}
                        style={{ flexShrink: 0, border: "none", background: "none", color: "var(--ink-3)", fontSize: 12, cursor: "pointer" }}
                      >
                        {deletingId === it.id ? "…" : "Delete"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Add item</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>Starts</label>
            <input
              type="datetime-local"
              className="admin-input"
              value={form.starts_at}
              onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
            />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>Ends</label>
            <input
              type="datetime-local"
              className="admin-input"
              value={form.ends_at}
              onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
            />
          </div>
          <div style={{ flex: "2 1 200px" }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>Title</label>
            <input
              className="admin-input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Opening / Plenary I"
            />
          </div>
          <div style={{ flex: "0 1 90px" }}>
            <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>Order</label>
            <input
              type="number"
              className="admin-input"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
            />
          </div>
        </div>
        <button
          onClick={add}
          disabled={pending || !form.starts_at || !form.ends_at || !form.title.trim()}
          style={{
            marginTop: 12,
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: pending ? "var(--ink-3)" : "var(--accent-grad)",
            color: "var(--accent-ink)",
            fontWeight: 600,
            fontSize: 14,
            cursor: pending ? "default" : "pointer",
          }}
        >
          {pending ? "Saving…" : "Add"}
        </button>
        {result && <span style={{ marginLeft: 12, fontSize: 13, color: "var(--ink-2)" }}>{result}</span>}
      </div>
    </div>
  );
}
