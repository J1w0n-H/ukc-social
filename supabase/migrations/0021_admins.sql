-- Admin access used to be a single env var compared with ===, in four separate
-- places. That has two failure modes, and the deployment hit the first one:
-- if ADMIN_EMAIL is missing or different on the host, /admin returns 404 for
-- everyone, and /admin's "Run matching" is the only way anyone gets seated.
-- The second is that adding a second admin needs a redeploy.
--
-- This table is a grant that survives both. ADMIN_EMAIL still works; this is
-- checked in addition to it (see lib/isAdmin.ts).
create table admins (
  user_id uuid primary key references profiles on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- RLS on with NO policies, deliberately. `profiles` lets a user update their
-- own row (p_upd in 0001_core), so anything resembling an is_admin column
-- there would let a user grant themselves admin. Here, authenticated users get
-- no select, insert, update or delete at all. Only the service role reaches
-- this table, and only from the server.
alter table admins enable row level security;
