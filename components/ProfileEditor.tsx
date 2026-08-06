"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AvatarCropper from "@/components/AvatarCropper";
import SchoolField from "@/components/SchoolField";
import PositionField from "@/components/PositionField";
import { uploadAvatar } from "@/app/actions/avatar";
import { saveProfile } from "@/app/actions/profile";
import { submitFlight, startOwnPool, cancelFlight, type SubmitFlightResult } from "@/app/actions/flights";
import FlightScanButton from "@/components/FlightScanButton";
import RideMatchSheet, { type RideProposal } from "@/components/RideMatchSheet";

type Profile = {
  name: string;
  school: string;
  position: string;
  interests: string[];
  bio: string;
  kakao: string;
  linkedin: string;
  instagram: string;
  dietary: string;
  photo_url: string | null;
};

type Flight = { arrival: string; departure: string };

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

// Flight values are bare "YYYY-MM-DDTHH:mm" (no offset) — already the
// conference-local wall clock (see toLocalInput), so a plain locale format
// reads them back correctly without re-applying a timezone.
function fmtFlight(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="ob-label">{children}</label>;
}

export default function ProfileEditor({
  initial,
  initialFlight,
  flightDefaults,
  initialWindowHours,
  timezone = "America/New_York",
}: {
  initial: Profile;
  initialFlight: Flight;
  flightDefaults: Flight;
  initialWindowHours: number;
  timezone?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Profile>(initial);
  const [flight, setFlight] = useState<Flight>({
    arrival: initialFlight.arrival || flightDefaults.arrival,
    departure: initialFlight.departure || flightDefaults.departure,
  });
  const [windowHours, setWindowHours] = useState(initialWindowHours);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<"idle" | "uploading" | "error">("idle");
  const [uploadError, setUploadError] = useState("");
  // The picked file waits here while you frame it. Nothing is uploaded until
  // the cropper hands back a square.
  const [picked, setPicked] = useState<File | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [proposals, setProposals] = useState<RideProposal[]>([]);

  const set = (p: Partial<Profile>) => setForm((f) => ({ ...f, ...p }));
  const setF = (p: Partial<Flight>) => setFlight((f) => ({ ...f, ...p }));

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  async function uploadBlob(blob: Blob) {
    setPicked(null);
    setUpload("uploading");
    setUploadError("");
    try {
      const data = new FormData();
      data.append("avatar", blob, "avatar.jpg");
      const result = await uploadAvatar(data);
      if (!result.ok) throw new Error(result.error);
      set({ photo_url: result.url });
      setUpload("idle");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed. Please try again.");
      setUpload("error");
    }
  }

  function addCustom() {
    const t = custom.trim();
    if (t && !form.interests.includes(t)) set({ interests: [...form.interests, t] });
    setCustom("");
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Name can't be empty.");
      return;
    }
    setError("");
    setBusy(true);
    const noopResult: SubmitFlightResult = { ok: true, status: "no_match" };
    const [profileRes, arrivalRes, departureRes] = await Promise.all([
      saveProfile({
        name: form.name.trim(),
        school: form.school,
        position: form.position,
        interests: form.interests,
        bio: form.bio,
        kakao: form.kakao,
        linkedin: form.linkedin,
        instagram: form.instagram,
        dietary: form.dietary,
        photo_url: form.photo_url ?? undefined,
      }),
      flight.arrival
        ? submitFlight({ direction: "arrival", localDateTime: flight.arrival, windowHours })
        : initialFlight.arrival
          ? cancelFlight("arrival")
          : Promise.resolve(noopResult),
      flight.departure
        ? submitFlight({ direction: "departure", localDateTime: flight.departure, windowHours })
        : initialFlight.departure
          ? cancelFlight("departure")
          : Promise.resolve(noopResult),
    ]);
    setBusy(false);
    if (profileRes.ok && arrivalRes.ok && departureRes.ok) {
      setEditing(false);
      const leftPreviousPool =
        ("leftPreviousPool" in arrivalRes && arrivalRes.leftPreviousPool) ||
        ("leftPreviousPool" in departureRes && departureRes.leftPreviousPool);
      flash(leftPreviousPool ? "Saved. Your old ride group was notified you left" : "Saved");

      // No one to propose joining — open your own pool right away rather
      // than leaving the flight saved with no pool at all (nothing else
      // creates one otherwise).
      const ownPoolCalls: Promise<unknown>[] = [];
      if ("status" in arrivalRes && arrivalRes.status === "no_match") ownPoolCalls.push(startOwnPool("arrival"));
      if ("status" in departureRes && departureRes.status === "no_match") ownPoolCalls.push(startOwnPool("departure"));
      if (ownPoolCalls.length) await Promise.all(ownPoolCalls);

      router.refresh();
      const newProposals = [arrivalRes, departureRes].filter(
        (r): r is Extract<SubmitFlightResult, { status: "proposal" }> =>
          "status" in r && r.status === "proposal",
      );
      if (newProposals.length) {
        setProposals(
          newProposals.map((p) => ({
            direction: p.direction,
            poolId: p.poolId,
            pickupAt: p.pickupAt,
            memberCount: p.memberCount,
          })),
        );
      }
    } else {
      const flightError = !arrivalRes.ok ? arrivalRes.error : !departureRes.ok ? departureRes.error : undefined;
      setError(profileRes.error ?? flightError ?? "Couldn't save. Try again.");
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (!editing) {
    return (
      <div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div
            aria-hidden
            style={{
              flex: "0 0 72px",
              width: 72,
              height: 72,
              aspectRatio: "1 / 1",
              borderRadius: "50%",
              border: "1px solid var(--line)",
              background: form.photo_url
                ? `center/cover no-repeat url("${form.photo_url}")`
                : "var(--surface)",
              color: "var(--ink-2)",
              display: "grid",
              placeItems: "center",
              fontSize: 26,
              fontWeight: 600,
              overflow: "hidden",
            }}
          >
            {!form.photo_url && initials(form.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>
              {form.name || "You"}
            </div>
            <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 2 }}>
              {[form.school, form.position].filter(Boolean).join(" · ") || "Not set"}
            </div>
          </div>
        </div>

        {form.interests.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {form.interests.map((i) => (
              <span key={i} className="pe-tag">
                {i}
              </span>
            ))}
          </div>
        )}
        {form.bio && (
          <p style={{ fontSize: 15, color: "var(--ink)", marginTop: 14, lineHeight: 1.5 }}>
            {form.bio}
          </p>
        )}

        {/* Reads initialFlight (what's actually saved), NOT `flight`. That state is
            seeded with flightDefaults so the datetime pickers open on a sensible date,
            and rendering it here claimed a flight the user never posted. router.refresh()
            after save re-renders this from the server, so it stays current. */}
        {(fmtFlight(initialFlight.arrival) || fmtFlight(initialFlight.departure)) && (
          <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 14 }}>
            ✈{" "}
            {fmtFlight(initialFlight.arrival)
              ? `Landing ${fmtFlight(initialFlight.arrival)}`
              : "No arrival set"}
            {" · "}
            {fmtFlight(initialFlight.departure)
              ? `Leaving ${fmtFlight(initialFlight.departure)}`
              : "No departure set"}
          </p>
        )}

        <button type="button" onClick={() => setEditing(true)} className="pe-edit-btn">
          Edit profile
        </button>
        <button type="button" onClick={signOut} className="pe-signout">
          Sign out
        </button>

        {toast && (
          <div className="pe-toast" role="status">
            {toast}
          </div>
        )}
        {proposals[0] && (
          <RideMatchSheet
            proposal={proposals[0]}
            timezone={timezone}
            onDone={() => setProposals((p) => p.slice(1))}
          />
        )}
        <PeStyles />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 4px" }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Change profile photo"
          style={{
            position: "relative",
            flex: "0 0 96px",
            width: 96,
            height: 96,
            aspectRatio: "1 / 1",
            boxSizing: "border-box",
            padding: 0,
            borderRadius: "50%",
            border: "1px solid var(--line)",
            background: form.photo_url
              ? `center/cover no-repeat url("${form.photo_url}")`
              : "var(--surface)",
            color: "var(--ink-2)",
            fontSize: 26,
            fontWeight: 600,
            cursor: "pointer",
            overflow: "hidden",
          }}
        >
          {!form.photo_url && initials(form.name)}
          {upload === "uploading" && (
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                background: "rgba(0,0,0,0.6)",
                fontSize: 12,
                color: "var(--ink)",
              }}
            >
              Uploading…
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) setPicked(file);
          }}
        />
      </div>
      {picked && (
        <AvatarCropper file={picked} onCancel={() => setPicked(null)} onDone={uploadBlob} />
      )}
      {upload === "error" && (
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--danger)", marginBottom: 8 }}>
          {uploadError || "Upload failed."}{" "}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{ color: "var(--accent)", fontWeight: 600 }}
          >
            retry
          </button>
        </p>
      )}

      <Label>Name</Label>
      <input className="ob-field" value={form.name} onChange={(e) => set({ name: e.target.value })} />
      <Label>School / Company</Label>
      <SchoolField value={form.school} onChange={(school) => set({ school })} />
      <Label>Position</Label>
      <PositionField value={form.position} onChange={(position) => set({ position })} />

      <Label>Interests</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {form.interests.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => set({ interests: form.interests.filter((x) => x !== i) })}
            className="pe-chip-on"
            aria-label={`Remove ${i}`}
          >
            {i} ✕
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addCustom();
        }}
      >
        <input
          className="ob-field"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Add an interest, press Enter"
        />
      </form>

      <Label>Bio</Label>
      <textarea
        className="ob-field"
        style={{ resize: "none", minHeight: 72 }}
        value={form.bio}
        onChange={(e) => set({ bio: e.target.value })}
        placeholder="One line about you"
      />
      <Label>KakaoTalk ID</Label>
      <input className="ob-field" value={form.kakao} onChange={(e) => set({ kakao: e.target.value })} />
      <Label>LinkedIn</Label>
      <input className="ob-field" value={form.linkedin} onChange={(e) => set({ linkedin: e.target.value })} />
      {/* The three contact fields no longer share one rule, so the one that
          changed says so where it is typed. Anyone who would rather not be
          looked up can clear the field here. */}
      <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.4, margin: "6px 0 0" }}>
        Everyone at the conference can see this. Kakao and Instagram stay private
        until you connect.
      </p>
      <Label>Instagram</Label>
      <input
        className="ob-field"
        value={form.instagram}
        onChange={(e) => set({ instagram: e.target.value })}
        placeholder="@handle"
      />
      <Label>Dietary notes</Label>
      <input
        className="ob-field"
        value={form.dietary}
        onChange={(e) => set({ dietary: e.target.value })}
        placeholder="Vegetarian, halal, allergies…"
      />

      <Label>Flights</Label>
      <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: -2, marginBottom: 4 }}>
        Just the time, matched with others flying near the same window on{" "}
        <a href="/rides" style={{ color: "var(--accent)", fontWeight: 600 }}>
          Rides
        </a>
        .
      </p>
      <div style={{ marginTop: 14 }}>
        <FlightScanButton onParsed={(direction, localDateTime) => setF({ [direction]: localDateTime })} />
      </div>
      <label className="ob-label" htmlFor="pe-arrival" style={{ marginTop: 0 }}>
        Landing
      </label>
      <input
        id="pe-arrival"
        type="datetime-local"
        className="ob-field"
        value={flight.arrival}
        onChange={(e) => setF({ arrival: e.target.value })}
      />
      <label className="ob-label" htmlFor="pe-departure">
        Leaving
      </label>
      <input
        id="pe-departure"
        type="datetime-local"
        className="ob-field"
        value={flight.departure}
        onChange={(e) => setF({ departure: e.target.value })}
      />
      {(flight.arrival || flight.departure) && (
        <>
          <label className="ob-label" htmlFor="pe-window">
            Search window (hours before/after)
          </label>
          <input
            id="pe-window"
            type="number"
            min={0.5}
            step={0.5}
            className="ob-field"
            style={{ maxWidth: 120 }}
            value={windowHours}
            onChange={(e) => setWindowHours(Number(e.target.value))}
          />
          <p style={{ fontSize: 12, color: "var(--ink-2)", marginTop: -2 }}>
            e.g. 2 = we&apos;ll look for a ride leaving within 2 hours of your time.
          </p>
        </>
      )}

      {error && <p style={{ color: "var(--danger)", fontSize: 14, marginTop: 16 }}>{error}</p>}

      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <button
          type="button"
          onClick={() => {
            setForm(initial);
            setFlight({
              arrival: initialFlight.arrival || flightDefaults.arrival,
              departure: initialFlight.departure || flightDefaults.departure,
            });
            setEditing(false);
            setError("");
          }}
          className="pe-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || upload === "uploading"}
          className="pe-save"
          style={{ opacity: busy || upload === "uploading" ? 0.5 : 1 }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      {toast && (
        <div className="pe-toast" role="status">
          {toast}
        </div>
      )}
      {proposals[0] && (
        <RideMatchSheet
          proposal={proposals[0]}
          timezone={timezone}
          onDone={() => setProposals((p) => p.slice(1))}
        />
      )}
      <PeStyles />
    </div>
  );
}

function PeStyles() {
  return (
    <style>{`
      .pe-tag {
        font-size: 13px;
        font-weight: 500;
        padding: 6px 12px;
        border-radius: 999px;
        background: var(--surface);
        color: var(--ink);
        border: 1px solid var(--line);
      }
      .pe-chip-on {
        padding: 8px 14px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 500;
        border: 1px solid var(--accent);
        background: var(--accent);
        color: var(--accent-ink);
        cursor: pointer;
      }
      .pe-edit-btn {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        margin-top: 20px;
        padding: 0 2px;
        font-size: 15px;
        font-weight: 700;
        border: none;
        color: var(--accent);
        background: none;
        cursor: pointer;
      }
      .pe-edit-btn::after { content: " ▸"; }
      /* Left-aligned and text-only, the same shape as Edit profile above it.
         As a full-width centred block it was the widest control on the page,
         which gave the rarest and least recoverable action the most weight. */
      .pe-signout {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        margin-top: 4px;
        /* Both actions are inline, so without this they butt up against each
           other and read as one phrase. */
        margin-left: 22px;
        padding: 0 2px;
        font-size: 15px;
        font-weight: 600;
        border: none;
        color: var(--ink-3);
        background: none;
        cursor: pointer;
      }
      .pe-signout:hover { color: var(--ink); }
      .pe-cancel {
        padding: 14px 20px;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 600;
        border: 1px solid var(--line);
        color: var(--ink);
        background: var(--bg);
      }
      .pe-save {
        flex: 1;
        padding: 14px;
        border-radius: 12px;
        font-size: 16px;
        font-weight: 700;
        background: var(--accent-grad);
        color: var(--accent-ink);
        border: none;
        transition: opacity 180ms ease-out;
      }
      .pe-toast {
        position: fixed;
        left: 50%;
        bottom: calc(96px + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        z-index: 60;
        background: var(--ink);
        color: var(--bg);
        font-size: 14px;
        padding: 10px 16px;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
        animation: pe-toast-in 200ms ease-out;
      }
      @keyframes pe-toast-in {
        from { opacity: 0; transform: translate(-50%, 8px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .pe-save { transition: none; }
        .pe-toast { animation: none; }
      }
    `}</style>
  );
}
