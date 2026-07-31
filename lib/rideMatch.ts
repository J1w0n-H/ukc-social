// Ride matching — the same "find-or-create a real group" idea as meals
// (lib/matching.ts), but simpler: no LLM, just closest-pickup-time-within-
// window, and a pool's pickup time re-centers as people join/leave instead
// of staying pinned to whoever anchored it first.

export type CandidatePool = {
  id: string;
  pickupAt: string; // ISO
  memberCount: number;
  capacity: number;
};

// The single best pool to propose joining: has room, and its pickup time is
// within `windowHours` of the new flight. Among qualifying pools, the
// closest one in time wins. null means nothing qualifies — the caller
// should offer "start your own" instead.
export function findBestPool(
  pools: CandidatePool[],
  flightAt: string,
  windowHours: number,
): CandidatePool | null {
  const target = new Date(flightAt).getTime();
  const windowMs = windowHours * 3600_000;

  let best: CandidatePool | null = null;
  let bestDelta = Infinity;
  for (const pool of pools) {
    if (pool.memberCount >= pool.capacity) continue;
    const delta = Math.abs(new Date(pool.pickupAt).getTime() - target);
    if (delta > windowMs) continue;
    if (delta < bestDelta) {
      best = pool;
      bestDelta = delta;
    }
  }
  return best;
}

// Re-centers a pool's pickup time as the plain average of every current
// member's own flight time — called after a join or a leave, so the group's
// stated pickup time stays representative of who's actually in it rather
// than frozen at whoever created the pool.
export function averagePickupAt(flightTimes: string[]): string {
  if (flightTimes.length === 0) throw new Error("averagePickupAt: no flight times");
  const avgMs = flightTimes.reduce((sum, t) => sum + new Date(t).getTime(), 0) / flightTimes.length;
  return new Date(avgMs).toISOString();
}

// Cancellation cutoff is "the night before," not same-day: true any time
// before the flight's own calendar day (in the conference's timezone)
// begins, false from that midnight on.
export function canCancelFlight(flightAt: string, timezone: string, nowIso: string): boolean {
  const dateOnly = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso));
  return dateOnly(nowIso) < dateOnly(flightAt);
}
