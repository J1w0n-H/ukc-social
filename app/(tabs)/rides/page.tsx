import { requireUser } from "@/lib/supabase/server";
import { EVENT_AIRPORT } from "@/lib/rides";
import { Board, type Row } from "./Board";

const timeFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

type FlightRow = {
  id: string;
  user_id: string;
  direction: "arrival" | "departure";
  other_city: string;
  other_iata: string;
  airline: string;
  flight_no: string;
  scheduled_at: string;
};

export default async function RidesPage() {
  const { user, supabase } = await requireUser();

  // flights table may not exist yet (migration 0006 pending) → treat as empty.
  const { data, error } = await supabase
    .from("flights")
    .select(
      "id, user_id, direction, other_city, other_iata, airline, flight_no, scheduled_at",
    )
    .eq("airport", EVENT_AIRPORT)
    .order("scheduled_at", { ascending: true });

  const flights: FlightRow[] = error ? [] : ((data as FlightRow[]) ?? []);

  // Names via directory_profiles (public fields, readable by anyone signed in),
  // not a profiles(...) embed — most posters here don't yet share a channel with
  // the viewer, and profiles' own RLS only opens up once they do.
  const posterIds = [...new Set(flights.map((f) => f.user_id))];
  const { data: posters } = posterIds.length
    ? await supabase.from("directory_profiles").select("id, name").in("id", posterIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((posters ?? []).map((p) => [p.id, p.name]));

  const toRow = (f: FlightRow): Row => {
    const t = new Date(f.scheduled_at).getTime();
    return {
      id: f.id,
      name: nameById.get(f.user_id) || "Someone",
      timeLabel: timeFmt.format(t),
      city: f.other_city,
      iata: f.other_iata,
      airline: f.airline,
      flightNumber: f.flight_no,
      scheduledMs: t,
      isMe: f.user_id === user.id,
    };
  };

  const arrivals = flights.filter((f) => f.direction === "arrival").map(toRow);
  const departures = flights.filter((f) => f.direction === "departure").map(toRow);

  return (
    <section className="rides">
      <header className="rides-head">
        <p className="rides-kicker">Orlando MCO · UKC 2026</p>
        <h1 className="rides-title">Rides</h1>
        <p className="rides-sub">See who flies near your time, then split a car.</p>
      </header>

      <Board arrivals={arrivals} departures={departures} />

      <RidesStyles />
    </section>
  );
}

function RidesStyles() {
  return (
    <style>{`
      .rides { padding: 28px 20px 24px; }
      .rides-head { margin-bottom: 20px; }
      .rides-kicker {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .rides-title {
        font-size: 40px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.03em;
        margin-top: 10px;
      }
      .rides-sub {
        margin-top: 10px;
        font-size: 15px;
        color: var(--ink-2);
        max-width: 34ch;
      }

      /* direction toggle — editorial text tabs, not a grey segmented control */
      .board-dir { display: flex; gap: 22px; border-bottom: 1px solid var(--line); margin-bottom: 4px; }
      .board-dir-on, .board-dir-off {
        background: none; border: none; padding: 0 0 12px; cursor: pointer;
        font-family: var(--font-display), sans-serif;
        font-size: 18px; font-weight: 700; letter-spacing: -0.01em;
      }
      .board-dir-on { color: var(--ink); box-shadow: inset 0 -2px 0 0 var(--accent); }
      .board-dir-off { color: var(--ink-3); }
      .board-hint { font-size: 13px; color: var(--ink-2); margin: 14px 0 2px; }

      /* the board — hairline-divided rows, no cards */
      .board { border-bottom: 1px solid var(--line); margin: 8px 0 20px; }
      .arr { border-top: 1px solid var(--line); }
      .arr-hot { background: color-mix(in srgb, var(--accent) 7%, transparent); }
      .arr-main {
        display: grid;
        grid-template-columns: auto 1fr auto;
        column-gap: 14px;
        align-items: baseline;
        padding: 16px 8px;
      }
      .arr-time {
        font-family: var(--font-display), sans-serif;
        font-size: 19px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        letter-spacing: -0.02em;
        color: var(--ink);
        white-space: nowrap;
      }
      .arr-body { min-width: 0; }
      .arr-name { font-size: 16px; font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px; }
      .arr-you {
        font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
        color: var(--accent);
      }
      .arr-meta { font-size: 13px; color: var(--ink-2); margin-top: 3px; text-wrap: pretty; }
      .arr-share {
        align-self: center;
        min-height: 44px;
        padding: 0 6px;
        background: none;
        border: none;
        color: var(--accent);
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
      }
      .arr-share span { margin-left: 2px; display: inline-block; transition: transform 0.15s ease; }
      .arr-share:hover span { transform: translateX(3px); }
      .arr-done {
        align-self: center;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        font-size: 13px;
        font-weight: 600;
        color: var(--ink-2);
        white-space: nowrap;
      }
      .arr-ack {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 8px 14px;
        padding: 10px 14px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--accent) 12%, transparent);
        font-size: 13px;
        color: var(--ink);
      }
      .arr-undo {
        flex-shrink: 0;
        min-height: 32px;
        padding: 0 8px;
        background: none;
        border: none;
        color: var(--accent);
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .rides-empty {
        margin-top: 44px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      }
      .rides-empty-title { font-family: var(--font-display), sans-serif; font-size: 18px; font-weight: 700; color: var(--ink); }
      .rides-empty-sub { font-size: 14px; color: var(--ink-2); max-width: 34ch; }

      .add-btn {
        display: inline-flex;
        align-items: center;
        align-self: flex-start;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1px solid var(--accent);
        background: none;
        color: var(--accent);
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .add-btn:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
      .rides-empty .add-btn { align-self: center; margin-top: 12px; }
    `}</style>
  );
}
