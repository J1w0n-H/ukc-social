-- A short, URL-shaped handle for a direct thread, so the address bar reads
-- /dm/V1StGXR8Z5 instead of /dm/33937020-ea61-43c8-950c-19b99b24b019.
--
-- This is a lookup key, not a secret. is_accepted_friend_channel still requires
-- the caller to be a party to the request, so guessing a slug returns a 404
-- exactly the way guessing a uuid does. That is why plain random() is fine here
-- and pgcrypto is not needed.
--
-- messages.channel_id keeps pointing at the request's uuid. The slug only ever
-- appears in the URL, so existing rows need no rewriting.

-- Alphabet drops 0/O/1/l/I, the characters people misread when a link is
-- retyped from a screenshot. 56 symbols over 10 places is about 3e17 values.
create or replace function short_id(n int default 10) returns text
language sql volatile as $$
  select string_agg(
    substr(
      '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ',
      1 + floor(random() * 56)::int,
      1
    ),
    ''
  )
  from generate_series(1, n);
$$;

alter table hi_requests add column if not exists slug text;
update hi_requests set slug = short_id(10) where slug is null;
alter table hi_requests alter column slug set default short_id(10);
alter table hi_requests alter column slug set not null;
create unique index if not exists hi_requests_slug_key on hi_requests (slug);
