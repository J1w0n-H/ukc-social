"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToRequest } from "@/app/actions/hi";

export type IncomingRequest = {
  id: string;
  name: string;
  school: string;
  position: string;
  photo_url: string | null;
};

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

// Requests waiting on you, pinned above the directory. Answering is also
// possible from the sender's own card, but that only works if you can find
// them, and the person who just asked to connect is not necessarily someone
// you can pick out of a list of names. This is what the notification opens onto.
export default function FriendRequests({ requests }: { requests: IncomingRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // Answered rows leave immediately rather than waiting on the refresh, so the
  // list does not sit there looking unresponsive mid-round-trip.
  const [done, setDone] = useState<Set<string>>(new Set());

  const open = requests.filter((r) => !done.has(r.id));
  if (open.length === 0) return null;

  async function respond(id: string, accept: boolean) {
    setBusy(id);
    const r = await respondToRequest(id, accept);
    setBusy(null);
    if (r.ok) {
      setDone((d) => new Set(d).add(id));
      router.refresh();
    }
  }

  return (
    <div className="fq">
      <div className="fq-head">
        Requests
        <span className="fq-count">{open.length}</span>
      </div>
      {open.map((r) => (
        <div key={r.id} className="fq-row">
          <div className="fq-av" aria-hidden style={
            r.photo_url ? { backgroundImage: `url("${r.photo_url}")` } : undefined
          }>
            {!r.photo_url && initials(r.name)}
          </div>
          <div className="fq-who">
            <div className="fq-name">{r.name || "Someone"}</div>
            <div className="fq-sub">
              {[r.school, r.position].filter(Boolean).join(" · ") || "No details yet"}
            </div>
          </div>
          <div className="fq-btns">
            <button
              type="button"
              className="fq-yes"
              disabled={busy === r.id}
              onClick={() => respond(r.id, true)}
            >
              {busy === r.id ? "…" : "Accept"}
            </button>
            <button
              type="button"
              className="fq-no"
              disabled={busy === r.id}
              onClick={() => respond(r.id, false)}
            >
              Decline
            </button>
          </div>
        </div>
      ))}

      <style>{`
        .fq { margin-bottom: 22px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
        .fq-head {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 700; color: var(--ink-2);
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .fq-count {
          min-width: 18px; padding: 1px 6px; border-radius: 999px;
          background: var(--accent); color: var(--accent-ink);
          font-size: 11px; font-weight: 700; letter-spacing: 0;
        }
        .fq-row {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 0; border-bottom: 1px solid var(--line);
        }
        .fq-row:last-of-type { border-bottom: none; }
        .fq-av {
          flex-shrink: 0; width: 42px; height: 42px; border-radius: 50%;
          background: var(--surface) center/cover no-repeat;
          display: grid; place-items: center;
          font-size: 15px; font-weight: 600; color: var(--ink-2);
        }
        .fq-who { flex: 1; min-width: 0; }
        .fq-name {
          font-size: 15px; font-weight: 700; color: var(--ink);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .fq-sub {
          font-size: 13px; color: var(--ink-2); margin-top: 1px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .fq-btns { flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
        .fq-yes {
          min-height: 36px; padding: 0 14px; border: 0; border-radius: 10px;
          background: var(--accent); color: var(--accent-ink);
          font-size: 14px; font-weight: 700; cursor: pointer;
        }
        .fq-no {
          min-height: 36px; padding: 0 8px; border: none; background: none;
          color: var(--ink-2); font-size: 14px; font-weight: 600; cursor: pointer;
        }
        .fq-no:hover:not(:disabled) { color: var(--ink); }
        .fq-yes:disabled, .fq-no:disabled { opacity: 0.5; cursor: default; }
      `}</style>
    </div>
  );
}
