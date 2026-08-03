-- Instagram alongside kakao and linkedin. Same class of data, so it lives on
-- the base table and inherits p_sel: readable by you, or by someone who shares
-- a channel with you, which since 0023 includes an accepted friend.
--
-- Deliberately NOT added to directory_profiles. That view is the public roster
-- and has only ever carried name, photo, school, position, interests, bio and
-- stay dates. Contact handles are the thing accepting a request unlocks, so
-- putting one in the view would hand it to everyone signed in.
alter table profiles add column if not exists instagram text not null default '';
