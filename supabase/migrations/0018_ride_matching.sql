-- Rides get the same real matching meals already have (find-or-create a
-- group by time, not just "browse individual flights and click join").
--
-- window_hours: how far before/after their own flight a poster wants to
-- search for a ride-mate — asked at submit time (see lib/rideMatch.ts).
alter table flights add column window_hours numeric not null default 2 check (window_hours > 0);

-- ride_pools used to be 1:1 with a single "anchor" flight (migration 0011,
-- one pool per poster, "Share" = join someone's personal pool). That's gone
-- now that a pool is a real multi-person group matched by time window, not
-- whoever's row you happened to click.
alter table ride_pools drop column anchor_flight_id;
alter table ride_pools add column airport text not null default '';

-- A pool's pickup_at re-centers as the average of every member's own flight
-- time when someone joins or leaves (lib/rideMatch.ts's averagePickupAt),
-- rather than staying pinned to whoever created it. 0011 only ever granted
-- insert on ride_pools; update/delete were missing entirely. No owner
-- column on ride_pools (matches rp_sel/rp_ins's existing "any authenticated"
-- reasoning — a pool isn't any one person's row), so these are just as open.
create policy rp_upd on ride_pools for update using (auth.role() = 'authenticated');
create policy rp_del on ride_pools for delete using (auth.role() = 'authenticated');
