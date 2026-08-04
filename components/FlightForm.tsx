"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitFlight, startOwnPool } from "@/app/actions/flights";
import FlightScanButton from "@/components/FlightScanButton";
import RideMatchSheet, { type RideProposal } from "@/components/RideMatchSheet";

type Direction = "arrival" | "departure";

// Posting a flight, on the Rides tab where the rides are. The same fields
// exist inside the profile editor, but reaching them meant leaving Rides,
// scrolling past nine unrelated profile fields, and saving the whole profile
// to record a flight time.
export default function FlightForm({
  direction,
  initialLocal,
  defaultLocal,
  windowHours,
  timezone,
  onClose,
}: {
  direction: Direction;
  initialLocal: string;
  defaultLocal: string;
  windowHours: number;
  timezone: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [local, setLocal] = useState(initialLocal || defaultLocal);
  const [hours, setHours] = useState(windowHours);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<RideProposal | null>(null);

  async function save() {
    setBusy(true);
    setError("");
    const res = await submitFlight({ direction, localDateTime: local, windowHours: hours });
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }

    if (res.status === "proposal") {
      setBusy(false);
      setProposal({
        direction: res.direction,
        poolId: res.poolId,
        pickupAt: res.pickupAt,
        memberCount: res.memberCount,
      });
      return;
    }

    // Nobody to ride with yet, so open a pool anchored on this flight rather
    // than leaving the flight saved with no pool at all. Nothing else creates
    // one, and an existing pool is a no-op here.
    if (res.status === "no_match") await startOwnPool(direction);
    setBusy(false);
    router.refresh();
    onClose();
  }

  return (
    <div className="ff">
      <FlightScanButton onParsed={(d, dt) => d === direction && setLocal(dt)} />

      <label className="ff-label" htmlFor={`ff-${direction}`}>
        {direction === "arrival" ? "Landing" : "Leaving"}
      </label>
      <input
        id={`ff-${direction}`}
        type="datetime-local"
        className="ob-field"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />

      <label className="ff-label" htmlFor={`ff-w-${direction}`}>
        Match me within
      </label>
      <div className="ff-window">
        <input
          id={`ff-w-${direction}`}
          type="number"
          min={0.5}
          step={0.5}
          className="ob-field"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        />
        <span>hours of my flight</span>
      </div>

      {error && <p className="ff-error">{error}</p>}

      <div className="ff-actions">
        <button type="button" className="ff-cancel" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="ff-save" onClick={save} disabled={busy || !local}>
          {busy ? "Saving…" : "Save flight"}
        </button>
      </div>

      {proposal && (
        <RideMatchSheet
          proposal={proposal}
          timezone={timezone}
          onDone={() => {
            setProposal(null);
            router.refresh();
            onClose();
          }}
        />
      )}

      <style>{`
        .ff { margin-top: 12px; }
        .ff-label {
          display: block;
          margin-top: 12px;
          margin-bottom: 4px;
          font-size: 13px;
          font-weight: 600;
          color: var(--ink-2);
        }
        .ff-window { display: flex; align-items: center; gap: 10px; }
        .ff-window .ob-field { max-width: 92px; margin: 0; }
        .ff-window span { font-size: 13px; color: var(--ink-2); }
        .ff-error { font-size: 13px; color: var(--danger); margin-top: 10px; }
        .ff-actions { display: flex; gap: 10px; margin-top: 16px; }
        .ff-cancel {
          padding: 11px 18px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          border: 1px solid var(--line);
          color: var(--ink);
          background: none;
        }
        .ff-save {
          flex: 1;
          padding: 11px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          border: none;
          background: var(--accent-grad);
          color: var(--accent-ink);
        }
        .ff-save:disabled, .ff-cancel:disabled { opacity: 0.5; }
      `}</style>
    </div>
  );
}
