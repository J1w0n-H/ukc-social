"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitFlight, parseFlightScreenshot } from "@/app/actions/flights";
import type { Direction, FlightDraft } from "@/lib/rides";

type Fields = {
  direction: Direction;
  flightNo: string;
  airline: string;
  otherCity: string;
  otherIata: string;
  localDateTime: string;
  luggage: boolean;
};

const EMPTY: Fields = {
  direction: "arrival",
  flightNo: "",
  airline: "",
  otherCity: "",
  otherIata: "",
  localDateTime: "",
  luggage: true,
};

export function AddFlightForm({ initial }: { initial?: Partial<Fields> }) {
  const router = useRouter();
  const [f, setF] = useState<Fields>({ ...EMPTY, ...initial });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scan, setScan] = useState<null | "reading" | "no_key" | "done" | "error">(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Fields>(k: K, v: Fields[K]) => setF((p) => ({ ...p, [k]: v }));

  const arrival = f.direction === "arrival";

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setScan("reading");
    setError("");
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(file);
    }).catch(() => "");
    const base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) return setScan("error");

    const r = await parseFlightScreenshot(base64, file.type || "image/jpeg");
    if (!r.ok) {
      setScan(r.reason === "no_key" ? "no_key" : "error");
      return;
    }
    applyDraft(r.draft);
    setScan("done");
  }

  function applyDraft(d: FlightDraft) {
    setF((p) => ({
      ...p,
      direction: d.direction ?? p.direction,
      flightNo: d.flightNo ?? p.flightNo,
      airline: d.airline ?? p.airline,
      otherCity: d.otherCity ?? p.otherCity,
      otherIata: d.otherIata ?? p.otherIata,
      localDateTime: d.localDateTime ?? p.localDateTime,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const res = await submitFlight(f);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't save that.");
    router.push("/rides");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="ff">
      {/* Direction — editorial text toggle, not a grey segmented control */}
      <div className="ff-dir" role="tablist" aria-label="Arrival or departure">
        <button
          type="button"
          role="tab"
          aria-selected={arrival}
          className={arrival ? "ff-dir-on" : "ff-dir-off"}
          onClick={() => set("direction", "arrival")}
        >
          Arriving
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!arrival}
          className={!arrival ? "ff-dir-on" : "ff-dir-off"}
          onClick={() => set("direction", "departure")}
        >
          Leaving
        </button>
      </div>

      {/* Screenshot shortcut */}
      <button type="button" className="ff-scan" onClick={() => fileRef.current?.click()}>
        {scan === "reading" ? "Reading your screenshot…" : "📷 Fill from a ticket screenshot"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        style={{ display: "none" }}
      />
      {scan === "no_key" && (
        <p className="ff-scan-note">Screenshot reading isn&apos;t switched on yet. Type it in below.</p>
      )}
      {scan === "done" && (
        <p className="ff-scan-note ff-ok">Filled from your screenshot. Give it a check.</p>
      )}
      {scan === "error" && (
        <p className="ff-scan-note">Couldn&apos;t read that one. Type it in below.</p>
      )}

      <label className="ff-field">
        <span>Flight number</span>
        <input
          value={f.flightNo}
          onChange={(e) => set("flightNo", e.target.value)}
          placeholder="DL1423"
          autoCapitalize="characters"
        />
      </label>

      <label className="ff-field">
        <span>Airline</span>
        <input
          value={f.airline}
          onChange={(e) => set("airline", e.target.value)}
          placeholder="Delta"
        />
      </label>

      <div className="ff-row">
        <label className="ff-field" style={{ flex: 2 }}>
          <span>{arrival ? "Flying from" : "Flying to"}</span>
          <input
            value={f.otherCity}
            onChange={(e) => set("otherCity", e.target.value)}
            placeholder="Boston"
          />
        </label>
        <label className="ff-field" style={{ flex: 1 }}>
          <span>Code</span>
          <input
            value={f.otherIata}
            onChange={(e) => set("otherIata", e.target.value)}
            placeholder="BOS"
            autoCapitalize="characters"
            maxLength={4}
          />
        </label>
      </div>

      <label className="ff-field">
        <span>{arrival ? "Lands at Orlando (MCO)" : "Leaves Orlando (MCO)"}</span>
        <input
          type="datetime-local"
          value={f.localDateTime}
          onChange={(e) => set("localDateTime", e.target.value)}
        />
      </label>

      <button
        type="button"
        className="ff-lug"
        aria-pressed={f.luggage}
        onClick={() => set("luggage", !f.luggage)}
      >
        <span className={f.luggage ? "ff-check on" : "ff-check"} aria-hidden>
          {f.luggage ? "✓" : ""}
        </span>
        I&apos;ll have checked luggage
      </button>

      {error && <p className="ff-error">{error}</p>}

      <button type="submit" className="ff-submit" disabled={busy}>
        {busy ? "Saving…" : "Post my flight"}
      </button>

      <FormStyles />
    </form>
  );
}

function FormStyles() {
  return (
    <style>{`
      .ff { display: flex; flex-direction: column; gap: 22px; margin-top: 26px; }
      .ff-dir { display: flex; gap: 22px; border-bottom: 1px solid var(--line); }
      .ff-dir-on, .ff-dir-off {
        background: none; border: none; padding: 0 0 12px; cursor: pointer;
        font-family: var(--font-display), sans-serif;
        font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
      }
      .ff-dir-on { color: var(--ink); box-shadow: inset 0 -2px 0 0 var(--accent); }
      .ff-dir-off { color: var(--ink-3); }

      .ff-scan {
        align-self: flex-start;
        min-height: 44px; padding: 0 16px;
        border-radius: 999px; border: 1px dashed var(--line);
        background: none; color: var(--ink-2);
        font-size: 14px; font-weight: 600; cursor: pointer;
        transition: border-color 0.15s ease, color 0.15s ease;
      }
      .ff-scan:hover { border-color: var(--accent); color: var(--accent); }
      .ff-scan-note { margin: -12px 0 0; font-size: 13px; color: var(--ink-2); }
      .ff-scan-note.ff-ok { color: var(--accent); }

      .ff-row { display: flex; gap: 16px; }
      .ff-field { display: flex; flex-direction: column; gap: 7px; }
      .ff-field > span { font-size: 13px; font-weight: 600; color: var(--ink-2); }
      .ff-field input {
        border: none; border-bottom: 1px solid var(--line);
        background: none; color: var(--ink);
        font-size: 17px; padding: 4px 0 8px; outline: none;
        transition: border-color 0.15s ease;
      }
      .ff-field input::placeholder { color: var(--ink-3); }
      .ff-field input:focus { border-bottom-color: var(--accent); }

      .ff-lug {
        display: inline-flex; align-items: center; gap: 10px;
        align-self: flex-start; min-height: 44px;
        background: none; border: none; padding: 0; cursor: pointer;
        font-size: 15px; color: var(--ink);
      }
      .ff-check {
        width: 22px; height: 22px; border-radius: 6px;
        border: 1px solid var(--line);
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 800; color: var(--accent-ink);
        transition: background 0.12s ease, border-color 0.12s ease;
      }
      .ff-check.on { background: var(--accent); border-color: var(--accent); }

      .ff-error { margin: 0; font-size: 14px; color: var(--danger); }
      .ff-submit {
        margin-top: 4px; min-height: 52px; border-radius: 14px; border: none;
        background: var(--accent-grad); color: var(--accent-ink);
        font-size: 16px; font-weight: 700; cursor: pointer;
        transition: opacity 0.15s ease;
      }
      .ff-submit:disabled { opacity: 0.5; cursor: default; }
    `}</style>
  );
}
