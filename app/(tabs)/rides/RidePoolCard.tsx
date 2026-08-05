"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cancelFlight, startOwnPool } from "@/app/actions/flights";
import FlightForm from "@/components/FlightForm";
import { displayName } from "@/lib/displayName";

type Direction = "arrival" | "departure";
type PoolMember = { id: string; name: string; photo_url: string | null };
type Pool = {
  poolId: string;
  pickupAt: string;
  members: PoolMember[];
};

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

export default function RidePoolCard({
  direction,
  hasFlight,
  pool,
  timezone,
  initialLocal,
  defaultLocal,
  windowHours,
}: {
  direction: Direction;
  hasFlight: boolean;
  pool: Pool | null;
  timezone: string;
  initialLocal: string;
  defaultLocal: string;
  windowHours: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // A flight with no pool. startOwnPool is idempotent, so this is a safe way
  // out of a state the user cannot otherwise act on.
  function retryPool() {
    setError("");
    startTransition(async () => {
      const res = await startOwnPool(direction);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Couldn't set that up.");
    });
  }

  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  function cancel() {
    setError("");
    startTransition(async () => {
      const res = await cancelFlight(direction);
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      } else {
        setError(res.error ?? "Couldn't cancel.");
      }
    });
  }

  const label = direction === "arrival" ? "Arrival" : "Departure";

  const flightForm = (
    <FlightForm
      direction={direction}
      initialLocal={initialLocal}
      defaultLocal={defaultLocal}
      windowHours={windowHours}
      timezone={timezone}
      onClose={() => setEditing(false)}
    />
  );

  if (!hasFlight) {
    return (
      <div className="rpc-card rpc-empty">
        <div className="rpc-label">{label}</div>
        {editing ? (
          flightForm
        ) : (
          <>
            <p className="rpc-empty-text">No {direction} posted yet.</p>
            <button type="button" className="rpc-add" onClick={() => setEditing(true)}>
              + Add your {direction}
            </button>
          </>
        )}
        <RpcStyles />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="rpc-card">
        <div className="rpc-label">{label}</div>
        {flightForm}
        <RpcStyles />
      </div>
    );
  }

  return (
    <div className="rpc-card">
      <div className="rpc-label">{label}</div>
      {pool ? (
        <>
          <div className="rpc-time">{fmt.format(new Date(pool.pickupAt))}</div>
          <div className="rpc-count">
            {pool.members.length === 0
              ? "Still looking for someone to share with. You'll be matched automatically, and the group chat opens as soon as someone joins."
              : `You + ${pool.members.length} ${pool.members.length === 1 ? "other" : "others"}`}
          </div>
          {pool.members.map((m) => (
            <div key={m.id} className="rpc-member">
              <div
                aria-hidden
                className="rpc-avatar"
                style={m.photo_url ? { background: `center/cover no-repeat url("${m.photo_url}")` } : undefined}
              >
                {!m.photo_url && initials(m.name)}
              </div>
              <span>{displayName(m.name)}</span>
            </div>
          ))}
          <div className="rpc-actions">
            {/* No chat while you are the only one in the pool: it would open a
                thread with nobody in it. The pool is the channel, so it is
                already there the moment a second person joins. */}
            {pool.members.length > 0 ? (
              <Link href={`/rides/${pool.poolId}/chat`} className="rpc-chat">
                Open chat
              </Link>
            ) : (
              <span className="rpc-waiting">Waiting for a match</span>
            )}
            {!confirming ? (
              <span className="rpc-secondary">
                <button type="button" className="rpc-cancel" onClick={() => setEditing(true)}>
                  Edit time
                </button>
                <button type="button" className="rpc-cancel" onClick={() => setConfirming(true)}>
                  Cancel
                </button>
              </span>
            ) : (
              <span className="rpc-confirm">
                Cancel this ride?{" "}
                <button type="button" onClick={cancel} disabled={pending} className="rpc-confirm-yes">
                  {pending ? "…" : "Yes"}
                </button>{" "}
                <button type="button" onClick={() => setConfirming(false)} className="rpc-confirm-no">
                  No
                </button>
              </span>
            )}
          </div>
          <p className="rpc-deadline">You can cancel anytime up until the night before your flight.</p>
          {error && <p className="rpc-error">{error}</p>}
        </>
      ) : (
        <>
          <p className="rpc-empty-text">
            Your flight is saved, but no ride is set up for it yet.
          </p>
          <div className="rpc-actions">
            <button type="button" className="rpc-chat" onClick={retryPool} disabled={pending}>
              {pending ? "…" : "Set up my ride"}
            </button>
            <button type="button" className="rpc-cancel" onClick={() => setEditing(true)}>
              Edit time
            </button>
          </div>
          {error && <p className="rpc-error">{error}</p>}
        </>
      )}
      <RpcStyles />
    </div>
  );
}

function RpcStyles() {
  return (
    <style>{`
      .rpc-card {
        margin-top: 12px;
        padding: 16px;
        border: 1px solid var(--line);
        border-radius: 14px;
      }
      .rpc-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--ink-3);
      }
      .rpc-empty-text { font-size: 14px; color: var(--ink-2); margin-top: 6px; }
      .rpc-add {
        display: inline-block;
        margin-top: 10px;
        font-size: 14px;
        font-weight: 700;
        color: var(--accent);
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
      }
      .rpc-secondary { display: flex; align-items: center; gap: 14px; }
      .rpc-waiting {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        font-size: 13px;
        font-weight: 600;
        color: var(--ink-3);
      }
      .rpc-time {
        font-family: var(--font-display), sans-serif;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin-top: 4px;
      }
      .rpc-count { font-size: 13px; color: var(--ink-2); margin-top: 4px; }
      .rpc-member {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        border-top: 1px solid var(--line);
        margin-top: 8px;
        font-size: 14px;
        color: var(--ink);
      }
      .rpc-avatar {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 1px solid var(--line);
        background: var(--surface);
        color: var(--ink-2);
        display: grid;
        place-items: center;
        font-size: 12px;
        font-weight: 600;
        overflow: hidden;
      }
      .rpc-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 14px;
      }
      .rpc-chat {
        min-height: 32px;
        padding: 6px 14px;
        border-radius: 999px;
        border: 1px solid var(--accent);
        color: var(--accent);
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
      }
      .rpc-cancel {
        background: none;
        border: none;
        color: var(--ink-3);
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .rpc-confirm { font-size: 13px; color: var(--ink-2); }
      .rpc-confirm-yes { background: none; border: none; color: var(--danger); font-weight: 700; cursor: pointer; }
      .rpc-confirm-no { background: none; border: none; color: var(--ink-2); font-weight: 600; cursor: pointer; }
      .rpc-deadline { font-size: 12px; color: var(--ink-3); margin-top: 10px; }
      .rpc-error { font-size: 13px; color: var(--danger); margin-top: 8px; }
    `}</style>
  );
}
