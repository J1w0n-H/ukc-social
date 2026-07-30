-- 홈 tab, step 2: admin-editable announcement + conference schedule.
--
-- Announcement is a single value tied 1:1 to the conference (same singleton
-- pattern as everything else on `conferences`) — null/blank means "no
-- announcement," and the app defaults to a welcome message in that case
-- rather than treating it as an error.
alter table conferences add column announcement text;

-- Schedule is a real list (breakfast/sessions/dinners across several days,
-- often several running in parallel at the same time), so it gets its own
-- table rather than a single field. Flat rows, not nested days/tracks:
-- multiple rows sharing the same starts_at/ends_at are simply parallel
-- sessions, grouped client-side (see lib/schedule.ts).
create table schedule_items (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  title text not null,
  -- Left-to-right reading order for items that share a time slot (e.g. three
  -- parallel tracks) — insertion order alone isn't guaranteed stable.
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

alter table schedule_items enable row level security;

-- Public read, same reasoning as conferences (s_sel on slots, c_sel on
-- conferences): schedule isn't sensitive, and every signed-in user (incl.
-- anonymous/guest) needs it on 홈. All writes go through the service-role
-- client after an app-level ADMIN_EMAIL check — no insert/update/delete
-- policy granted here.
create policy sch_sel on schedule_items for select using (auth.role() = 'authenticated');
