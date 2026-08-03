"use client";

import { useRef, useState } from "react";
import { downscale } from "@/lib/avatar";
import { parseFlightScreenshot } from "@/app/actions/flightScan";

// Fills the flight form from a screenshot. It only ever prefills: the value
// lands in the same input you could have typed, and you confirm it before
// anything is saved. A misread arrival time would otherwise put someone in the
// wrong car at an airport.
//
// Manual entry is never taken away. When there is no API key configured the
// action says so and this quietly reports that scanning is unavailable rather
// than leaving a button that fails.
export default function FlightScanButton({
  onParsed,
}: {
  onParsed: (direction: "arrival" | "departure", localDateTime: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "reading" | "done">("idle");
  const [note, setNote] = useState("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setState("reading");
    setNote("");

    try {
      // 1400px on the long side, not the avatar default of 512: a boarding pass
      // is mostly small print, and 512 loses the flight time entirely.
      const blob = await downscale(file, 1400);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => reject(new Error("Could not read that file."));
        fr.readAsDataURL(blob);
      });

      const r = await parseFlightScreenshot(dataUrl, new Date().getFullYear());
      setState("idle");
      if (!r.ok) {
        setNote(
          r.reason === "no_key"
            ? "Scanning is not set up yet. Enter the time below."
            : "Could not read that one. Enter the time below.",
        );
        return;
      }
      // Direction is the one field worth guessing at when illegible: an arrival
      // is the far more common thing to be filling in first.
      onParsed(r.draft.direction ?? "arrival", r.draft.localDateTime!);
      setState("done");
      setNote("Filled in below. Check it before saving.");
    } catch {
      setState("idle");
      setNote("Could not read that one. Enter the time below.");
    }
  }

  return (
    <div className="fs">
      <button
        type="button"
        className="fs-btn"
        onClick={() => fileRef.current?.click()}
        disabled={state === "reading"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {state === "reading" ? "Reading…" : "Scan a boarding pass"}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
      {note && (
        <p className="fs-note" role="status" data-ok={state === "done" ? "true" : "false"}>
          {note}
        </p>
      )}

      <style>{`
        .fs { margin-bottom: 14px; }
        .fs-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; min-height: 44px;
          border: 1px solid var(--line); border-radius: 12px;
          background: transparent; color: var(--ink);
          font-size: 14px; font-weight: 600; cursor: pointer;
          transition: border-color 150ms ease-out;
        }
        .fs-btn:hover:not(:disabled) { border-color: var(--ink-3); }
        .fs-btn:disabled { opacity: 0.6; cursor: default; }
        .fs-note { margin: 8px 0 0; font-size: 13px; color: var(--ink-2); }
        .fs-note[data-ok="true"] { color: var(--accent); }
      `}</style>
    </div>
  );
}
