-- Adds two more notification triggers: a new chat message, and a new/changed
-- admin announcement. Widens the type check constraint rather than replacing
-- it, so existing rows (table_revealed/ride_matched/hi_received) are
-- untouched.
alter table notifications drop constraint notifications_type_check;
alter table notifications add constraint notifications_type_check
  check (type in ('table_revealed', 'ride_matched', 'hi_received', 'new_message', 'announcement'));
