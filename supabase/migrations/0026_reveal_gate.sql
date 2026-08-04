-- Tables are seated ahead of time but must not be visible until the reveal.
--
-- The app already promises a moment ("Tables revealed <join_deadline>" in
-- JoinSheet and GoingSheet) but nothing enforced it: matchOneSlot inserted
-- groups plus a table_revealed notification, and Home read straight from
-- group_members, so seating and revealing were the same instant. That left
-- only two options, both bad: match late and risk tables landing after dinner
-- has started, or match early and spoil the reveal.
--
-- Enforced in RLS rather than in each query. Groups are read from Home, Me,
-- the reveal screen, the group chat and the meals page, and a gate that lives
-- in five WHERE clauses is one forgotten clause away from leaking.
-- Service-role writes are unaffected, so matching still seats people early.

alter table groups add column if not exists reveal_at timestamptz;

-- Backfill and default from the slot's own deadline, so the reveal moment is
-- the one already shown to people rather than a second source of truth.
update groups g
set reveal_at = s.join_deadline
from slots s
where s.id = g.slot_id and g.reveal_at is null;

-- A group with no reveal_at is treated as revealed: that is how every group
-- created before this migration behaved, and a null must not silently hide a
-- table that people were already told about.
create or replace function group_revealed(gid uuid) returns boolean
language sql stable security definer as $$
  select coalesce(
    (select g.reveal_at <= now() from groups g where g.id = gid),
    true
  );
$$;
grant execute on function group_revealed to authenticated;

drop policy if exists g_sel on groups;
create policy g_sel on groups for select using (
  group_revealed(id)
  and exists (select 1 from group_members m where m.group_id = id and m.user_id = auth.uid())
);

drop policy if exists gm_sel on group_members;
create policy gm_sel on group_members for select using (
  group_revealed(group_id) and is_group_member(group_id)
);

-- Notifications get the same treatment. table_revealed is written at seating
-- time, so without this the bell would announce the table days early even
-- with the rows themselves hidden.
alter table notifications add column if not exists visible_at timestamptz not null default now();

drop policy if exists notif_sel on notifications;
create policy notif_sel on notifications for select using (
  auth.uid() = user_id and visible_at <= now()
);
