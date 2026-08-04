-- New flight posts default to matching within one hour. Existing users keep
-- the window they explicitly saved; this only changes future database defaults.
alter table flights alter column window_hours set default 1;
