-- signups shipped with select, insert and delete policies (0001_core) and no
-- update policy. joinSlot (app/actions/signups.ts) writes with an upsert on
-- (slot_id, user_id), which PostgREST compiles to ON CONFLICT DO UPDATE, and
-- Postgres checks the UPDATE policy on that path. So the first join inserted
-- and succeeded, and every later edit of party size or notes was denied.
--
-- Reachable in two taps: GoingSheet's "Change how many / notes" opens JoinSheet
-- in edit mode, which calls the same action.
--
-- using + with check both, so a row can be edited by its owner but never
-- reassigned to another user.
create policy su_upd on signups
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
