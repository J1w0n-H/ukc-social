"use client";

export type EventChoice = "ukc2026" | "ksea2026" | "none";

const EVENTS: { id: EventChoice; name: string; when: string }[] = [
  { id: "ukc2026", name: "UKC 2026", when: "Aug 5–8 · ChampionsGate, FL" },
  { id: "ksea2026", name: "KSEA Conference", when: "Oct 2026 · Washington, DC" },
  { id: "none", name: "None of these", when: "I'm just exploring the app" },
];

export default function StepEvent({
  eventId,
  stayStart,
  stayEnd,
  onChange,
  onContinue,
  busy,
  error,
}: {
  eventId: EventChoice | "";
  stayStart: string;
  stayEnd: string;
  onChange: (p: Partial<{ eventId: EventChoice; stayStart: string; stayEnd: string }>) => void;
  onContinue: () => void;
  busy: boolean;
  error: string;
}) {
  const ready = !!eventId;

  return (
    <>
      <span className="ob-kicker">Set up · 1 of 5</span>
      <h1 className="ob-title">Which event are you here for?</h1>
      <p className="ob-sub">This tunes who you&apos;re matched with.</p>

      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        {EVENTS.map((ev) => {
          const on = eventId === ev.id;
          return (
            <button
              key={ev.id}
              type="button"
              className={on ? "ev-card on" : "ev-card"}
              onClick={() => onChange({ eventId: ev.id })}
              aria-pressed={on}
            >
              <span className="ev-name">{ev.name}</span>
              <span className="ev-when">{ev.when}</span>
            </button>
          );
        })}
      </div>

      <p className="ob-label" style={{ marginTop: 24, marginBottom: 0 }}>
        How long are you staying?
      </p>
      <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
        <div style={{ flex: 1 }}>
          <label className="ob-label" htmlFor="ob-checkin" style={{ marginTop: 8, fontWeight: 400 }}>
            Check-in
          </label>
          <input
            id="ob-checkin"
            type="date"
            className="ob-field"
            value={stayStart}
            max={stayEnd || undefined}
            onChange={(e) => onChange({ stayStart: e.target.value })}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="ob-label" htmlFor="ob-checkout" style={{ marginTop: 8, fontWeight: 400 }}>
            Check-out
          </label>
          <input
            id="ob-checkout"
            type="date"
            className="ob-field"
            value={stayEnd}
            min={stayStart || undefined}
            onChange={(e) => onChange({ stayEnd: e.target.value })}
          />
        </div>
      </div>
      <p style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
        We&apos;ll only match you with people who are actually around while you&apos;re here.
      </p>

      {error && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 16 }}>{error}</p>}

      <button
        type="button"
        className="ob-primary"
        onClick={onContinue}
        disabled={!ready || busy}
        style={{ marginTop: 28, width: "100%" }}
      >
        {busy ? "Saving…" : "Continue"}
      </button>

      <style>{`
        .ev-card {
          display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
          width: 100%; text-align: left; padding: 14px 16px;
          border: 1px solid var(--line); border-radius: 14px; background: transparent;
          transition: border-color 150ms ease-out, background 150ms ease-out;
        }
        .ev-card.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
        .ev-name { font-size: 15px; font-weight: 700; color: var(--ink); }
        .ev-when { font-size: 12px; color: var(--ink-2); }
      `}</style>
    </>
  );
}
