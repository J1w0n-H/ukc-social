"use client";

import { useState } from "react";
import { submitFlight, deleteFlight } from "@/app/actions/flights";

// Conference dates as a starting point when nothing's saved yet — same
// reasoning as the onboarding flight step: a blank datetime-local input
// means setting year/month/day/hour/minute one at a time from scratch.
const DEFAULT_ARRIVAL = "2026-08-05T12:00";
const DEFAULT_DEPARTURE = "2026-08-08T12:00";

export default function FlightEditor({
  initialArrival,
  initialDeparture,
}: {
  initialArrival: string;
  initialDeparture: string;
}) {
  const [arrival, setArrival] = useState(initialArrival || DEFAULT_ARRIVAL);
  const [departure, setDeparture] = useState(initialDeparture || DEFAULT_DEPARTURE);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  async function save() {
    setBusy(true);
    const results = await Promise.all([
      arrival
        ? submitFlight({ direction: "arrival", localDateTime: arrival })
        : initialArrival
          ? deleteFlight("arrival")
          : Promise.resolve({ ok: true }),
      departure
        ? submitFlight({ direction: "departure", localDateTime: departure })
        : initialDeparture
          ? deleteFlight("departure")
          : Promise.resolve({ ok: true }),
    ]);
    setBusy(false);
    flash(results.every((r) => r.ok) ? "Saved" : "Couldn't save. Try again.");
  }

  const dirty = arrival !== initialArrival || departure !== initialDeparture;

  return (
    <div style={{ marginTop: 32 }}>
      <h2 className="sec-h">My flights</h2>
      <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>
        Just the time — we&apos;ll match you with others flying near the same window on{" "}
        <a href="/rides" style={{ color: "var(--accent)", fontWeight: 600 }}>
          Rides
        </a>
        .
      </p>

      <label className="ob-label" htmlFor="me-arrival" style={{ marginTop: 16 }}>
        Landing
      </label>
      <input
        id="me-arrival"
        type="datetime-local"
        className="ob-field"
        value={arrival}
        onChange={(e) => setArrival(e.target.value)}
      />

      <label className="ob-label" htmlFor="me-departure">
        Leaving
      </label>
      <input
        id="me-departure"
        type="datetime-local"
        className="ob-field"
        value={departure}
        onChange={(e) => setDeparture(e.target.value)}
      />

      <button
        type="button"
        className="ob-primary"
        onClick={save}
        disabled={busy || !dirty}
        style={{ marginTop: 16, width: "100%" }}
      >
        {busy ? "Saving…" : "Save flights"}
      </button>

      {toast && (
        <div
          role="status"
          style={{
            marginTop: 10,
            fontSize: 13,
            color: "var(--ink-2)",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
