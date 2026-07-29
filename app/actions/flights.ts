"use server";

import { requireUser } from "@/lib/supabase/server";
import { EVENT_AIRPORT, EVENT_OFFSET, type Direction, type FlightInput } from "@/lib/rides";

type Result = { ok: boolean; error?: string };

export async function submitFlight(input: FlightInput): Promise<Result> {
  const { user, supabase } = await requireUser();
  if (!input.localDateTime) return { ok: false, error: "Add your flight time." };

  const scheduledAt = new Date(`${input.localDateTime}:00${EVENT_OFFSET}`);
  if (isNaN(scheduledAt.getTime())) return { ok: false, error: "That time didn't parse." };

  const { error } = await supabase.from("flights").upsert(
    {
      user_id: user.id,
      direction: input.direction,
      airport: EVENT_AIRPORT,
      scheduled_at: scheduledAt.toISOString(),
      luggage: true,
    },
    { onConflict: "user_id,direction" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteFlight(direction: Direction): Promise<Result> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("flights")
    .delete()
    .eq("user_id", user.id)
    .eq("direction", direction);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
