"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { joinProposedPool, startOwnPool } from "@/app/actions/flights";

export type RideProposal = {
  direction: "arrival" | "departure";
  poolId: string;
  pickupAt: string;
  memberCount: number;
};

// Shown after submitFlight() finds a compatible ride pool — asks before
// joining rather than auto-joining, same "propose, then confirm" shape as
// JoinSheet's schedule-conflict override.
export default function RideMatchSheet({
  proposal,
  timezone,
  onDone,
}: {
  proposal: RideProposal;
  timezone: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"join" | "own" | null>(null);
  const [error, setError] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sheetRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  async function join() {
    setBusy("join");
    setError("");
    const res = await joinProposedPool(proposal.poolId);
    setBusy(null);
    if (res.ok) {
      router.refresh();
      onDone();
    } else {
      setError(res.error ?? "Couldn't join. Try again.");
    }
  }

  async function own() {
    setBusy("own");
    setError("");
    const res = await startOwnPool(proposal.direction);
    setBusy(null);
    if (res.ok) {
      router.refresh();
      onDone();
    } else {
      setError(res.error ?? "Couldn't start your own ride. Try again.");
    }
  }

  return (
    <div className="rms-backdrop" onClick={onDone}>
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="rms-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Ride match found"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rms-grabber" />
        <p className="rms-kicker">{proposal.direction === "arrival" ? "Landing" : "Leaving"} nearby</p>
        <h2 className="rms-title">A ride is leaving around {fmt.format(new Date(proposal.pickupAt))}</h2>
        <p className="rms-sub">
          {proposal.memberCount} {proposal.memberCount === 1 ? "person is" : "people are"} already in it.
          Join them, or start your own instead.
        </p>
        {error && <p className="rms-error">{error}</p>}
        <button type="button" onClick={join} disabled={!!busy} className="rms-join">
          {busy === "join" ? "Joining…" : "Join this ride"}
        </button>
        <button type="button" onClick={own} disabled={!!busy} className="rms-own">
          {busy === "own" ? "Starting…" : "Start my own instead"}
        </button>
      </div>
      <style>{`
        .rms-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          background: var(--overlay);
          display: flex;
          align-items: flex-end;
          animation: rms-fade 200ms ease-out;
        }
        .rms-sheet {
          width: 100%;
          background: var(--bg);
          border-radius: 16px 16px 0 0;
          padding: 8px 20px calc(24px + env(safe-area-inset-bottom));
          box-shadow: 0 -8px 40px rgba(0, 0, 0, 0.5);
          animation: rms-up 300ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .rms-sheet:focus { outline: none; }
        .rms-grabber {
          width: 36px;
          height: 5px;
          border-radius: 999px;
          background: var(--line);
          margin: 6px auto 18px;
        }
        .rms-kicker {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--accent);
          margin: 0;
        }
        .rms-title {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.01em;
          margin: 8px 0 0;
        }
        .rms-sub { font-size: 14px; color: var(--ink-2); margin-top: 8px; line-height: 1.5; }
        .rms-error { color: var(--danger); font-size: 14px; margin-top: 12px; }
        .rms-join {
          display: block;
          width: 100%;
          margin-top: 20px;
          padding: 15px;
          border-radius: 12px;
          border: none;
          background: var(--accent-grad);
          color: var(--accent-ink);
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
        }
        .rms-own {
          display: block;
          width: 100%;
          margin-top: 10px;
          padding: 13px;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: none;
          color: var(--ink);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
        }
        .rms-join:disabled, .rms-own:disabled { opacity: 0.5; cursor: default; }
        @keyframes rms-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rms-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
          .rms-backdrop, .rms-sheet { animation: none; }
        }
      `}</style>
    </div>
  );
}
