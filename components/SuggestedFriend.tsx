"use client";

import { useState, useTransition } from "react";
import { sendRequest } from "@/app/actions/hi";
import type { Suggestion } from "@/lib/suggestPerson";

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

// One person at a time. The server hands over a few ranked candidates so
// sending a request can step to the next one without a round trip.
export default function SuggestedFriend({ people }: { people: Suggestion[] }) {
  const [index, setIndex] = useState(0);
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const person = people[index];
  if (!person && !sentTo) return null;

  function send(id: string, name: string) {
    setError("");
    startTransition(async () => {
      const res = await sendRequest(id);
      if (!res.ok) {
        setError(res.error ?? "Couldn't send that.");
        return;
      }
      setSentTo(name);
      setIndex((i) => i + 1);
    });
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div className="hub-head">Connect with new people!</div>
      {sentTo && <div className="sugg-sent">Request sent to {sentTo}.</div>}
      {person && (
        <div className="hub-list">
          <div className="sugg-row">
            <div
              aria-hidden
              className="sugg-avatar"
              style={
                person.photo_url
                  ? { background: `center/cover no-repeat url("${person.photo_url}")` }
                  : undefined
              }
            >
              {!person.photo_url && initials(person.name)}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="sugg-name">{person.name}</div>
              {[person.school, person.position].filter(Boolean).length > 0 && (
                <div className="sugg-meta">
                  {[person.school, person.position].filter(Boolean).join(" · ")}
                </div>
              )}
              {/* Same two lines the table card uses, so the reason for a
                  suggestion reads like the reason for a tablemate. */}
              {person.shared.length > 0 ? (
                <div className="sugg-why">
                  <span style={{ color: "var(--ink-3)" }}>you both like </span>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                    {person.shared.join(", ")}
                  </span>
                </div>
              ) : (
                person.interests.length > 0 && (
                  <div className="sugg-why" style={{ color: "var(--ink-3)" }}>
                    into {person.interests.slice(0, 3).join(", ")}
                  </div>
                )
              )}
            </div>
            <button
              type="button"
              className="sugg-add"
              onClick={() => send(person.id, person.name)}
              disabled={pending}
            >
              {pending ? "…" : "Say hi"}
            </button>
          </div>
        </div>
      )}
      {error && <div className="sugg-error">{error}</div>}
      <style>{`
        .sugg-sent { font-size: 13px; color: var(--accent); margin: 6px 0 2px; }
        .sugg-error { font-size: 13px; color: var(--danger, #e5484d); margin-top: 8px; }
        .sugg-row {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px 0;
          border-top: 1px solid var(--line);
        }
        .sugg-avatar {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid var(--line);
          background: var(--surface);
          color: var(--ink-2);
          display: grid;
          place-items: center;
          font-size: 14px;
          font-weight: 600;
          overflow: hidden;
        }
        .sugg-name { font-size: 15px; font-weight: 600; color: var(--ink); }
        .sugg-meta { font-size: 13px; color: var(--ink-2); }
        .sugg-why { font-size: 13px; margin-top: 3px; line-height: 1.4; }
        .sugg-add {
          flex-shrink: 0;
          min-height: 32px;
          padding: 6px 14px;
          border-radius: 999px;
          border: 1px solid var(--accent);
          background: none;
          color: var(--accent);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }
        .sugg-add:disabled { opacity: 0.55; cursor: default; }
      `}</style>
    </div>
  );
}
