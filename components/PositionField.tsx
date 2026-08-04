"use client";

import { POSITIONS } from "@/lib/roles";

// Pick one, rather than typing it. Chips instead of a select: there are six
// options, they all fit, and seeing them is what stops someone inventing a
// seventh spelling of one that already exists.
export default function PositionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // Anything stored before this field was a picker, and anything the matcher
  // could not resolve. Shown as a chip so it is visible and replaceable rather
  // than silently dropped.
  const legacy = value && !POSITIONS.includes(value as (typeof POSITIONS)[number]) ? value : null;

  return (
    <div className="pf" role="group" aria-label="Position">
      {POSITIONS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={value === p}
          className={value === p ? "pf-chip pf-chip--on" : "pf-chip"}
          onClick={() => onChange(value === p ? "" : p)}
        >
          {p}
        </button>
      ))}
      {legacy && (
        <button
          type="button"
          aria-pressed
          className="pf-chip pf-chip--on pf-chip--legacy"
          onClick={() => onChange("")}
          title="Pick one of the options above to replace this"
        >
          {legacy} ✕
        </button>
      )}

      <style>{`
        .pf {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }
        .pf-chip {
          padding: 8px 14px;
          border-radius: 999px;
          font-size: 14px;
          font-weight: 500;
          border: 1px solid var(--line);
          background: transparent;
          color: var(--ink);
          cursor: pointer;
          transition: border-color 150ms ease-out, background 150ms ease-out;
        }
        .pf-chip--on {
          border-color: var(--accent);
          background: var(--accent);
          color: var(--accent-ink);
          font-weight: 600;
        }
        .pf-chip--legacy {
          background: transparent;
          color: var(--accent);
        }
        @media (prefers-reduced-motion: reduce) {
          .pf-chip { transition: none; }
        }
      `}</style>
    </div>
  );
}
