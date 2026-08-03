-- Friend requests. hi_requests (0010) could only ever be sent: no status column,
-- no update policy, and 0010 deliberately kept it out of shares_channel so a hi
-- unlocked nothing. The recipient had no way to answer and the sender got
-- nothing back, so the only route to someone's contacts was sharing a table or
-- a ride with them.
--
-- A request now has an answer, and accepting it unlocks contacts and opens a
-- direct thread.

-- 1. The answer. Existing rows predate this and are treated as still pending.
alter table hi_requests
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'accepted', 'declined'));

-- Only the recipient answers. `using` picks the rows they may touch and `with
-- check` re-tests the row afterwards, so neither party can be rewritten to hand
-- the request to someone else. The sender gets no update grant at all: they may
-- ask, not decide.
create policy hi_upd on hi_requests for update
  using (auth.uid() = to_user_id)
  with check (auth.uid() = to_user_id);

-- Withdrawing a request you sent, and removing one you accepted. Bounded to
-- your own rows either way, and both sides can walk it back later.
create policy hi_del on hi_requests for delete
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- 2. An accepted request is a channel between two people, the same way a shared
-- table or ride is. This one function is the whole contact gate: profiles.p_sel
-- (0008) and can_see_contact (0002) are its only callers, and both should treat
-- an accepted friend exactly like a tablemate. The message policies do not go
-- through here, they test group_members and ride_members directly, so widening
-- this grants contact visibility and nothing else.
create or replace function shares_channel(a uuid, b uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from group_members g1 join group_members g2 using (group_id)
    where g1.user_id = a and g2.user_id = b
  ) or exists (
    select 1 from ride_members r1 join ride_members r2 using (pool_id)
    where r1.user_id = a and r2.user_id = b
  ) or exists (
    select 1 from hi_requests h
    where h.status = 'accepted'
      and ((h.from_user_id = a and h.to_user_id = b)
        or (h.from_user_id = b and h.to_user_id = a))
  );
$$;

-- 3. Direct threads. messages is keyed (channel_type, channel_id) with
-- channel_id a bare uuid and no foreign key, so a friend thread is just a third
-- channel type whose id is the request's own id. Nothing about the messages
-- table or the chat UI needs to change shape.
alter table messages drop constraint messages_channel_type_check;
alter table messages add constraint messages_channel_type_check
  check (channel_type in ('meal', 'ride', 'direct'));

-- security definer so reading hi_requests from inside a messages policy does not
-- re-enter hi_requests' own RLS. Same pattern as is_group_member (0003).
create or replace function is_accepted_friend_channel(req uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from hi_requests h
    where h.id = req
      and h.status = 'accepted'
      and (h.from_user_id = auth.uid() or h.to_user_id = auth.uid())
  );
$$;

-- Rewritten rather than added to, since a policy cannot be extended in place.
-- The meal and ride branches are carried over from 0001 unchanged.
drop policy if exists m_sel on messages;
create policy m_sel on messages for select using (
  (channel_type = 'meal' and exists (select 1 from group_members m
     where m.group_id = channel_id and m.user_id = auth.uid()))
  or (channel_type = 'ride' and exists (select 1 from ride_members r
     where r.pool_id = channel_id and r.user_id = auth.uid()))
  or (channel_type = 'direct' and is_accepted_friend_channel(channel_id)));

drop policy if exists m_ins on messages;
create policy m_ins on messages for insert with check (
  auth.uid() = user_id and (
    (channel_type = 'meal' and exists (select 1 from group_members m
       where m.group_id = channel_id and m.user_id = auth.uid()))
    or (channel_type = 'ride' and exists (select 1 from ride_members r
       where r.pool_id = channel_id and r.user_id = auth.uid()))
    or (channel_type = 'direct' and is_accepted_friend_channel(channel_id))));

-- Declining or withdrawing revokes the thread: is_accepted_friend_channel stops
-- returning true, so m_sel hides the history rather than leaving it readable.

-- 4. The sender hears back. Without this only the recipient is ever told
-- anything, and a request would look identical whether it was accepted or
-- ignored.
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('table_revealed', 'ride_matched', 'hi_received', 'new_message',
                  'announcement', 'ride_member_left', 'friend_accepted'));
