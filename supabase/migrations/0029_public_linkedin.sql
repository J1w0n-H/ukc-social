-- LinkedIn becomes visible to everyone at the conference. Kakao and Instagram
-- do not.
--
-- The three were gated together only because one policy covers the whole
-- profiles row (0008). They are not the same kind of data: a LinkedIn page is
-- already public and is exactly the thing that makes a friend request worth
-- accepting, while a Kakao ID and an Instagram handle are personal contact
-- details that should still cost an accept.
--
-- Done by widening directory_profiles rather than p_sel: the view runs as its
-- owner, so this adds exactly one readable column and leaves the base table's
-- row-level gate untouched. kakao and instagram stay off the view, so the only
-- way to read them is still through profiles, which still requires
-- shares_channel.
--
-- Appending at the end is what create or replace view allows; the existing
-- columns keep their position, so every current select stays valid.
create or replace view directory_profiles with (security_invoker = false) as
  select id, name, photo_url, school, position, interests, bio, stay_start, stay_end,
         linkedin
  from profiles;
grant select on directory_profiles to authenticated;
