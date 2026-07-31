"use server";

import { requireUser } from "@/lib/supabase/server";
import { getConference } from "@/lib/conference";
import { serviceClient } from "@/lib/supabase/service";
import { findBestPool, averagePickupAt, canCancelFlight, type CandidatePool } from "@/lib/rideMatch";
import { type Direction, type FlightInput } from "@/lib/rides";

type Result = { ok: boolean; error?: string };
type Supa = Awaited<ReturnType<typeof requireUser>>["supabase"];

// Is this user already in a pool for this direction? Guards startOwnPool/
// joinProposedPool against creating a second pool alongside an existing
// match (double-click, two tabs, a stale proposal after already matching
// some other way) — submitFlight already checks this before proposing, but
// the actions it proposes need their own guard too, not just the caller.
async function findMyPoolId(supabase: Supa, userId: string, direction: Direction): Promise<string | null> {
  const { data: myMembership } = await supabase.from("ride_members").select("pool_id").eq("user_id", userId);
  const myPoolIds = (myMembership ?? []).map((m) => m.pool_id as string);
  if (!myPoolIds.length) return null;
  const { data: pools } = await supabase.from("ride_pools").select("id").eq("direction", direction).in("id", myPoolIds);
  return pools?.[0]?.id ?? null;
}

// Removes userId from poolId, re-centers the pool's pickup time on whoever's
// left (or clears the pool out entirely if that was the last member), and
// notifies the remaining members — shared by an explicit cancellation
// (cancelFlight) and an automatic one (submitFlight, when an already-matched
// flight's time actually changes).
async function leavePool(supabase: Supa, userId: string, poolId: string): Promise<void> {
  await supabase.from("ride_members").delete().eq("pool_id", poolId).eq("user_id", userId);
  const { data: remaining } = await supabase.from("ride_members").select("user_id, flight_at").eq("pool_id", poolId);
  if (remaining && remaining.length) {
    await supabase
      .from("ride_pools")
      .update({ pickup_at: averagePickupAt(remaining.map((r) => r.flight_at as string)) })
      .eq("id", poolId);
    // The leaver isn't a recipient of their own departure, and the rest
    // aren't the caller's own session, so this needs the service-role client.
    await serviceClient()
      .from("notifications")
      .insert(
        remaining.map((r) => ({
          user_id: r.user_id as string,
          type: "ride_member_left" as const,
          payload: { pool_id: poolId },
        })),
      );
  } else {
    await supabase.from("ride_pools").delete().eq("id", poolId);
  }
}

export type SubmitFlightResult =
  | { ok: false; error: string }
  | { ok: true; status: "already_matched" }
  | { ok: true; status: "no_match"; leftPreviousPool?: boolean }
  | {
      ok: true;
      status: "proposal";
      direction: Direction;
      poolId: string;
      pickupAt: string;
      memberCount: number;
      leftPreviousPool?: boolean;
    };

// Saves the flight, then looks for (but does not join) a compatible ride
// pool — same/direction+airport, has room, pickup time within the poster's
// own search window. The caller shows a confirm step (join this pool, or
// start your own) rather than auto-joining; see joinProposedPool/
// startOwnPool below.
export async function submitFlight(
  input: FlightInput & { windowHours: number },
): Promise<SubmitFlightResult> {
  const { user, supabase } = await requireUser();
  if (!input.localDateTime) return { ok: false, error: "Add your flight time." };
  if (!Number.isFinite(input.windowHours) || input.windowHours <= 0) {
    return { ok: false, error: "Search window must be a positive number of hours." };
  }

  const conference = await getConference(supabase);
  const utcOffset = conference?.utc_offset ?? "-04:00";
  const scheduledAt = new Date(`${input.localDateTime}:00${utcOffset}`);
  if (isNaN(scheduledAt.getTime())) return { ok: false, error: "That time didn't parse." };
  const airport = conference?.airport_code ?? "";

  // Read the flight as it stood *before* this save, so a real time change
  // can be told apart from re-saving the same time (or just editing an
  // unrelated profile field).
  const { data: priorFlight } = await supabase
    .from("flights")
    .select("scheduled_at")
    .eq("user_id", user.id)
    .eq("direction", input.direction)
    .maybeSingle();

  const { error } = await supabase.from("flights").upsert(
    {
      user_id: user.id,
      direction: input.direction,
      airport,
      scheduled_at: scheduledAt.toISOString(),
      window_hours: input.windowHours,
      luggage: true,
    },
    { onConflict: "user_id,direction" },
  );
  if (error) return { ok: false, error: error.message };

  let leftPreviousPool = false;
  const existingPoolId = await findMyPoolId(supabase, user.id, input.direction);
  if (existingPoolId) {
    const timeChanged = priorFlight && priorFlight.scheduled_at !== scheduledAt.toISOString();
    if (!timeChanged) return { ok: true, status: "already_matched" };

    // Flight time actually changed while matched — the old pool's pickup
    // time no longer reflects this rider, so leave it (notifying whoever's
    // left) and fall through to search fresh, exactly like a first-time
    // submission would.
    await leavePool(supabase, user.id, existingPoolId);
    leftPreviousPool = true;
  }

  const { data: pools } = await supabase
    .from("ride_pools")
    .select("id, pickup_at, capacity")
    .eq("direction", input.direction)
    .eq("airport", airport)
    .eq("status", "open");
  const poolIds = (pools ?? []).map((p) => p.id as string);
  const { data: memberRows } = poolIds.length
    ? await supabase.from("ride_members").select("pool_id").in("pool_id", poolIds)
    : { data: [] as { pool_id: string }[] };
  const countByPool = new Map<string, number>();
  for (const m of memberRows ?? []) countByPool.set(m.pool_id, (countByPool.get(m.pool_id) ?? 0) + 1);

  const candidates: CandidatePool[] = (pools ?? []).map((p) => ({
    id: p.id as string,
    pickupAt: p.pickup_at as string,
    memberCount: countByPool.get(p.id as string) ?? 0,
    capacity: p.capacity as number,
  }));

  const best = findBestPool(candidates, scheduledAt.toISOString(), input.windowHours);
  if (!best) return { ok: true, status: "no_match", leftPreviousPool };

  return {
    ok: true,
    status: "proposal",
    direction: input.direction,
    poolId: best.id,
    pickupAt: best.pickupAt,
    memberCount: best.memberCount,
    leftPreviousPool,
  };
}

// User declined the proposal (or none existed) — open a new pool anchored
// at their own flight time, ready for someone else's submitFlight to find.
export async function startOwnPool(direction: Direction): Promise<Result> {
  const { user, supabase } = await requireUser();
  if (await findMyPoolId(supabase, user.id, direction)) return { ok: true };

  const conference = await getConference(supabase);
  const airport = conference?.airport_code ?? "";

  const { data: flight, error: flightErr } = await supabase
    .from("flights")
    .select("id, scheduled_at")
    .eq("user_id", user.id)
    .eq("direction", direction)
    .maybeSingle();
  if (flightErr) return { ok: false, error: flightErr.message };
  if (!flight) return { ok: false, error: "Post your flight first." };

  const { data: pool, error: poolErr } = await supabase
    .from("ride_pools")
    .insert({ direction, airport, pickup_at: flight.scheduled_at })
    .select("id")
    .single();
  if (poolErr) return { ok: false, error: poolErr.message };

  const { error: memberErr } = await supabase.from("ride_members").insert({
    pool_id: pool.id,
    user_id: user.id,
    flight_at: flight.scheduled_at,
    ready_at: flight.scheduled_at,
  });
  if (memberErr) return { ok: false, error: memberErr.message };

  return { ok: true };
}

// User confirmed the proposed match — join that pool and re-center its
// pickup time on everyone's actual flight time now that one more joined.
export async function joinProposedPool(poolId: string): Promise<Result & { full?: boolean }> {
  const { user, supabase } = await requireUser();

  const { data: pool, error: poolErr } = await supabase
    .from("ride_pools")
    .select("id, capacity, direction")
    .eq("id", poolId)
    .maybeSingle();
  if (poolErr) return { ok: false, error: poolErr.message };
  if (!pool) return { ok: false, error: "This ride isn't open anymore." };

  const { data: flight } = await supabase
    .from("flights")
    .select("scheduled_at")
    .eq("user_id", user.id)
    .eq("direction", pool.direction)
    .maybeSingle();
  if (!flight) return { ok: false, error: "Post your flight first." };

  const myExistingPoolId = await findMyPoolId(supabase, user.id, pool.direction as Direction);
  if (myExistingPoolId) return { ok: myExistingPoolId === poolId };

  const { data: existing, error: countErr } = await supabase
    .from("ride_members")
    .select("user_id, flight_at")
    .eq("pool_id", poolId);
  if (countErr) return { ok: false, error: countErr.message };
  const count = existing?.length ?? 0;
  if (count >= pool.capacity) return { ok: false, error: "This ride just filled up.", full: true };

  const { error: joinErr } = await supabase.from("ride_members").upsert(
    { pool_id: poolId, user_id: user.id, flight_at: flight.scheduled_at, ready_at: flight.scheduled_at },
    { onConflict: "pool_id,user_id", ignoreDuplicates: true },
  );
  if (joinErr) return { ok: false, error: joinErr.message };

  const allTimes = [
    ...(existing ?? []).map((m) => m.flight_at as string).filter(Boolean),
    flight.scheduled_at as string,
  ];
  const { error: recenterErr } = await supabase
    .from("ride_pools")
    .update({ pickup_at: averagePickupAt(allTimes) })
    .eq("id", poolId);
  if (recenterErr) return { ok: false, error: recenterErr.message };

  // Notify everyone already in the pool — the joiner isn't a recipient of
  // their own join, and most of them aren't the caller's own session, so
  // this needs the service-role client.
  const others = (existing ?? []).filter((m) => m.user_id !== user.id);
  if (others.length) {
    await serviceClient()
      .from("notifications")
      .insert(
        others.map((m) => ({
          user_id: m.user_id,
          type: "ride_matched" as const,
          payload: { pool_id: poolId, joined_user_id: user.id },
        })),
      );
  }

  return { ok: true };
}

// Explicit cancellation — only through "the night before" (canCancelFlight),
// not same-day. Leaves whatever pool this direction was matched into via
// the same leavePool() an automatic time-change uses.
export async function cancelFlight(direction: Direction): Promise<Result> {
  const { user, supabase } = await requireUser();
  const conference = await getConference(supabase);
  const timezone = conference?.timezone ?? "America/New_York";

  const { data: flight, error: flightErr } = await supabase
    .from("flights")
    .select("id, scheduled_at")
    .eq("user_id", user.id)
    .eq("direction", direction)
    .maybeSingle();
  if (flightErr) return { ok: false, error: flightErr.message };
  if (!flight) return { ok: true };

  if (!canCancelFlight(flight.scheduled_at as string, timezone, new Date().toISOString())) {
    return { ok: false, error: "Too late to cancel — only possible until the night before." };
  }

  const poolId = await findMyPoolId(supabase, user.id, direction);
  if (poolId) await leavePool(supabase, user.id, poolId);

  const { error } = await supabase.from("flights").delete().eq("id", flight.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
