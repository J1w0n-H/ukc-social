"use client";

import { useState } from "react";

export function RiderCard({
  name,
  timeLabel,
  city,
  iata,
  airline,
  flightNumber,
  isMe = false,
  inWindow = false,
}: {
  name: string;
  timeLabel: string;
  city: string;
  iata: string;
  airline: string;
  flightNumber: string;
  isMe?: boolean;
  inWindow?: boolean;
}) {
  const [sent, setSent] = useState(false);

  return (
    <div className={`arr${inWindow ? " arr-hot" : ""}`}>
      <div className="arr-main">
        <div className="arr-time">{timeLabel}</div>
        <div className="arr-body">
          <div className="arr-name">
            {name}
            {isMe && <span className="arr-you">You</span>}
          </div>
          <div className="arr-meta">
            {city}
            {iata ? ` (${iata})` : ""}
            {airline || flightNumber ? ` · ${airline} ${flightNumber}`.trimEnd() : ""}
          </div>
        </div>
        {isMe ? (
          <span className="arr-done">Posted</span>
        ) : sent ? (
          <span className="arr-done">Noted</span>
        ) : (
          <button
            type="button"
            className="arr-share"
            onClick={() => setSent(true)}
            aria-label={`Share a ride with ${name}`}
          >
            Share <span aria-hidden>▸</span>
          </button>
        )}
      </div>

      {sent && !isMe && (
        <div className="arr-ack" role="status">
          <span>Not sent to {name} yet — reach out to them directly for now.</span>
          <button type="button" className="arr-undo" onClick={() => setSent(false)}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
