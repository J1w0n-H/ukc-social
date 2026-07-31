-- One more notification trigger: the remaining members of a ride pool get
-- told when someone leaves (explicit cancellation, or an automatic leave
-- when an already-matched flight's time changes — see app/actions/
-- flights.ts's leavePool()). Widens the check constraint, same as 0017.
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('table_revealed', 'ride_matched', 'hi_received', 'new_message', 'announcement', 'ride_member_left'));
