# Icebreaker (formerly UKC Social) — Handoff / Status

_Last updated: 2026-07-31 (Ride-matching self-review: 2 bugs fixed, flight-time-change handling, dead code removed)_

### Update — 2026-07-31 Self-review of the ride-matching rewrite

Reviewed the previous day's ride-matching commit before moving on. Found one
bug that broke the feature outright, one lower-probability correctness gap,
and confirmed a chunk of pre-existing dead code was safe to delete.

- 🐛 **Bug fixed — `no_match` never created a pool at all.** `submitFlight`'s
  `no_match` result was never handled in `ProfileEditor.tsx` — only
  `proposal` did anything. `startOwnPool()` was only reachable by declining
  a proposal, so anyone with no one flying nearby yet (the common case: the
  first person to post a flight) had their flight saved but no pool, no
  chat — Rides showed "Setting up your ride…" forever. This broke the
  "없으면 만들거나" half of the original ask. Fixed: `save()` now calls
  `startOwnPool()` directly for any direction that came back `no_match`.
- 🐛 **Bug fixed — no guard against a duplicate pool.** `startOwnPool`/
  `joinProposedPool` didn't check whether the caller was already matched
  for that direction before creating/joining a pool — only `submitFlight`
  checked, before proposing. A double-click or two open tabs could leave
  someone in two pools for one direction, which would then make
  `submitFlight`'s own "am I already matched" lookup error out on "more
  than one row." Fixed: extracted `findMyPoolId()`, used it to guard both.
- **New: editing a matched flight to a real different time.** Previously
  silently did nothing — the pool stayed pinned to the old time forever.
  Decided (asked first): auto-leave the old pool (re-centering it for
  whoever's left, or clearing it if empty) and search fresh, exactly like a
  first-time submission. The *other* members get a new `ride_member_left`
  notification (migration `0019`, widens the same check constraint `0017`
  did). The leaver sees it too, via the save toast ("Saved — your old ride
  group was notified you left"). Re-saving with an *unchanged* time still
  short-circuits to `already_matched` — only a real time change triggers
  this.
- **Deleted `lib/flights.ts`, `lib/flights.test.ts`,
  `data/example-arrivals-mco-2026-08-04.json`.** Confirmed zero importers
  outside its own test (this was already flagged as dead in `README.md`
  before today). This was the old AeroDataBox-live-arrivals-feed approach
  to Rides, superseded by the self-reported-flight-time matching above.
  `AERODATABOX_API_KEY` dropped from `.env.example` and the Vercel deploy
  checklist — nothing reads it anymore.
- **Deferred (not started):** re-evaluating whether an *already-matched*
  flight's edit should also re-check the search window against the new
  time before deciding to leave (right now, any literal time change
  triggers a leave, even a 1-minute edit) — flagged, not built, matches the
  "일단" framing this was asked for. Mentor/mentee matching
  (`lib/mentorMatch.ts`, `/match-demo` — explicitly marked "NOT a shipped
  user surface") also stays parked for later.

Test count: 133 → 122 (net: -11 from deleting `lib/flights.test.ts`, no
regression — the ride-matching test suite itself is unchanged and still
passing).

### Update — 2026-07-30 Rides: real matching, not browse-and-join

Rides never actually matched anyone — `submitFlight` gave each poster their
own personal `ride_pools` row (one pool per flight, "Share" = join a
specific stranger's row you picked off a list), no algorithm at all. Rebuilt
it to work like meals: post a flight → search for a compatible group →
confirm join or start your own → get a real group chat. Decided explicitly
(asked first): **matching happens immediately** when a flight is submitted,
not batched by an admin/cron the way meal slots are — rides don't have a
shared deadline the way a dinner slot does, each person's flight time is
different, so there's nothing sensible to batch until.

- **Migration `0018_ride_matching.sql`**: `flights.window_hours` (search
  window in hours, asked for at submit time). Dropped `ride_pools.
  anchor_flight_id` (the old 1:1-with-one-flight concept) and added `ride_
  pools.airport`. Added missing `update`/`delete` RLS policies on
  `ride_pools` — 0011 only ever granted `insert`, so a pool's pickup time
  couldn't be recentered by anyone. **Not yet applied to the live project.**
- **`lib/rideMatch.ts`** (new, pure + tested, 13 tests): `findBestPool` —
  closest pool within the poster's window that isn't full, or `null`.
  `averagePickupAt` — a pool's pickup time re-centers as the plain average
  of every member's own flight time on join/leave, rather than staying
  pinned to whoever created it (the "재조정"/re-adjust half of the ask).
  `canCancelFlight` — true any time before the flight's own calendar day
  starts (in the conference's timezone), false from that midnight on — "취소는
  전날밤까지만."
- **`app/actions/flights.ts`** rewritten: `submitFlight` now saves the
  flight and *proposes* a match (doesn't auto-join) — returns a discriminated
  `no_match` / `already_matched` / `proposal` result. `joinProposedPool`
  joins + recenters + notifies (`ride_matched`, reused). `startOwnPool`
  creates a fresh pool from the poster's own flight when they decline (or
  nothing matched). `cancelFlight` replaces the old `deleteFlight` —
  deadline-gated, leaves the pool and recenters/clears it for whoever's left.
  `joinRide` (the old "join this specific flightId" action) is gone —
  there's no more browsing UI to call it from.
- **`components/RideMatchSheet.tsx`** (new): the confirm step — "A ride is
  leaving around {time} with {N} people — join, or start your own instead,"
  same propose-then-confirm shape as `JoinSheet`'s schedule-conflict
  override. `components/ProfileEditor.tsx`: added the search-window input,
  wired the sheet in (queued if both arrival and departure each turned up a
  proposal), swapped `deleteFlight` → `cancelFlight`.
- **Rides tab rewritten**: `app/(tabs)/rides/Board.tsx` and `RiderCard.tsx`
  (the old "browse everyone's flight, click Share" list) deleted. New
  `RidePoolCard.tsx` — one card per direction showing *your* matched
  pool (time, members, "Open chat," a deadline-gated inline "Cancel"
  confirm), or a prompt to post a flight if you haven't — same "you see your
  own table, not everyone's" shape meals already have on Home.
- **`app/rides/[id]/chat/page.tsx`** (new): a real ride group chat, reusing
  `components/Chat.tsx` (already supported `channelType="ride"` at the
  schema/RLS level — migration 0001 — just never had a page). Made three
  small copy/link spots in `Chat.tsx` conditional on `channelType` ("Your
  table" → "Your ride," the meal-only "See full profiles" link hidden for
  rides — there's no ride equivalent of `/groups/[id]`).
- **Known scope cut**: `/chat`'s unread-badge index (`message_reads`) stays
  meal-only — its `group_id` column has a hard FK to `groups`, not a generic
  channel reference, so ride chats don't get an unread count there yet.
  Ride chat itself works fine (send/receive/roster), just isn't wired into
  that particular badge. Widening `message_reads` to cover both was judged
  out of scope for this pass.
- **`lib/flights.ts`** (AeroDataBox live-arrivals feed + `bucketIntoPools`)
  was already dead code before this change — confirmed via grep, no
  importers outside its own test file, leftover from an earlier design
  direction. Left alone, not part of this rewrite.

Test count: 120 → 133.

### Update — 2026-07-30 All migrations applied — verified live, not just deployed

`0011`, `0013`, `0014`, `0017` (the last of the still-outstanding migrations)
were applied via the SQL editor and verified directly against the live
project: `ride_members`/`message_reads`/`notifications` all resolve, and the
`notifications.type` check constraint accepts `new_message`/`announcement`.
Combined with `0012`/`0015`/`0016` already confirmed earlier the same day,
**every migration through `0017` is now live** — ride "Share", `/chat`'s
unread badges, and all four notification triggers are functionally real on
the deployed app, not just shipped in code. See "Remaining Human TODOs"
below for what's still outstanding (`CRON_SECRET`, `ANTHROPIC_API_KEY`,
optional Google OAuth) — none of it is migrations anymore.

### Update — 2026-07-30 Notifications: new message + new announcement triggers

Asked what actually triggers a notification today — answer at the time was
just three: `table_revealed` (a group gets matched), `ride_matched` (someone
joins your ride pool), `hi_received` (Say hi, though its UI button is
currently hidden — see the 2026-07-30 "Say hi" update above). Group
assignment already had one; added the other two that were asked for.

- **Migration `0017_notification_types.sql`**: widens `notifications`'
  `type` check constraint to add `new_message` and `announcement` (existing
  rows/types untouched). **Not yet applied to the live Supabase project** —
  joins the still-unapplied backlog (`0011`, `0013`, `0014` — `0012`/`0015`/
  `0016` are now live).
- **`app/actions/messages.ts`**'s `sendMessage()`: after a message is
  inserted, notifies the *other* members of that channel (group_members for
  a meal chat, ride_members for a ride chat) — service-role client, same
  reasoning as every other cross-user notification write. **Collapsed**,
  not one row per message: skips anyone who already has an unread
  `new_message` notification for that same channel, so an active back-and-
  forth doesn't flood the bell with a duplicate entry per message.
- **`app/actions/conference.ts`**'s `upsertConference()`: fetches the
  conference's *current* `announcement` before writing, and broadcasts an
  `announcement` notification to every profile only if the new value is
  non-empty and actually differs from what was stored — re-saving the
  conference form for an unrelated field (dates, timezone, …) doesn't spam
  everyone.
- **`components/NotificationBell.tsx`**: copy + routing for both new types
  (`new_message` → the group's chat, or `/rides` for a ride channel since
  there's no ride-chat page yet; `announcement` → `/board`).

### Update — 2026-07-30 Conference-day status app-wide; 홈's schedule is now a day-by-day pager

Two follow-up requests after the schedule/announcement work landed: (1) the
"Day 2 of 4 · UKC 2026" status that was only in 친구's header should show
above every tab, not just one; (2) 홈's schedule should default to *today's*
day with prev/next paging, not a long stacked list of every day, and
whichever slot is happening right now should be visually highlighted.

- **`lib/conferenceDay.ts`**: new `formatConferenceDay(status, name)` —
  pulled the `before`/`during`/`after` → copy switch out of 친구's page into
  a shared, tested export (`null` for `no-conference`, so each caller picks
  its own fallback). 4 new tests.
- **`app/(tabs)/layout.tsx`**: now fetches the conference and renders a
  sticky `.day-status-bar` above `{children}` — shown on every tab (홈,
  친구, 채팅, 매칭, 마이페이지), not just one. Hidden entirely when no
  conference is registered (`formatConferenceDay` returns `null`) rather
  than falling back to a bare date, since a date on every single page isn't
  what was asked for.
- **`app/(tabs)/home/page.tsx`**: removed its own now-duplicate day label
  from the header (`dayHeaderLabel` deleted along with the now-unused
  `fmtDate`/`Conference` import) — 친구's header is just the wordmark again,
  the status lives in the shared bar above it.
- **`lib/schedule.ts`**: new `currentDayIndex(days, todayDate)` — which day
  홈's pager should open on: the exact match if today's in range, day 1 if
  today is before the schedule starts, the last day if today is after it
  ends (a gap day inside the range lands on the closest earlier day). 5 new
  tests.
- **`components/ScheduleDayView.tsx`** (new, client): replaces the old
  stacked-all-days view. Prev/next buttons page one day at a time; a "Today"
  tag shows on the actual current day (by date match, independent of which
  day is currently being viewed); the slot covering the current instant
  (`now >= starts_at && now < ends_at`) gets an accent background + bold
  text, but only when the viewed day *is* today — paging to another day
  never shows a stray highlight.
- **`app/(tabs)/board/page.tsx`**: computes `todayDate` (in the conference's
  timezone) and `initialIndex` server-side via `currentDayIndex`, passes
  both plus `nowIso` into `ScheduleDayView`.

Test count: 111 → 120.

### Update — 2026-07-30 홈 tab steps 2-4: admin inputs + the real UKC schedule

Finishes the plan from the placeholder commit: (2) admin can now enter an
announcement and schedule items, (3) 홈 renders them for real, (4) the
actual UKC 2026 schedule (Aug 4-8) was handed off and seeded.

- **Migration `0016_schedule_announcement.sql`**: adds `conferences.announcement`
  (nullable — blank means "no announcement," 홈 falls back to a welcome
  message) and a new `schedule_items` table (flat rows; several rows sharing
  one starts_at/ends_at are parallel tracks, e.g. three sessions running at
  once). ⚠️ **This migration alters the `conferences` table, so it can only
  be applied after `0012` is** — see "Remaining Human TODOs" below, this
  joins that same still-unapplied backlog.
- **`lib/schedule.ts`**: `groupScheduleByDay()` — pure grouping/sorting only
  (days → time slots → parallel items); display formatting stays in the
  caller, same split as `lib/slots.ts`. 6 new unit tests
  (`lib/schedule.test.ts`), including a timezone-boundary regression case.
- **`app/actions/schedule.ts`**: `upsertScheduleItem`/`deleteScheduleItem`,
  admin-gated, service-role writes — same pattern as every other admin
  action. `app/actions/conference.ts`'s `ConferenceInput` gained
  `announcement`.
- **`components/AdminScheduleForm.tsx`** (new) + `AdminConferenceForm.tsx`
  (added an Announcement textarea): embedded in `/admin` below the
  conference form. Schedule form lists existing items grouped by day with
  delete, plus an add-one-item form — fine for one-off future edits, but the
  30+ real UKC rows were seeded directly (see below), not hand-typed.
- **`app/(tabs)/board/page.tsx`**: no longer a static placeholder — reads
  `conference.announcement` (or the welcome default) and renders the real
  schedule via `groupScheduleByDay`, agenda-style (day header, then a time +
  stacked parallel-session list per slot).
- **`scripts/seed-schedule.ts`** (new, dev/one-time-import convenience,
  same `npx -y tsx --env-file=.env.local scripts/<f>.ts` pattern as
  `seed-slots.ts`): the real UKC 2026 program, transcribed from the handed-
  off schedule image — SEED (pre-conference, Tue-Wed), Opening/Plenary I,
  Signature Symposiums, Distinguished Sponsor Forums, KSEA/TG/FIRE/IES
  tracks, Gala/Networking dinners, Closing/Plenary III. Dedupes by
  `(title, starts_at)` pair (not title alone — "Breakfast"/"Lunch"
  legitimately repeat across days), so reruns are safe. **Not yet run
  against the live DB** — needs migration `0016` (and its `0012`
  prerequisite) applied first.

### Update — 2026-07-30 New 홈 tab (step 1 of 4: placeholder)

First step of a 4-step plan: (1) placeholder 홈 tab [this], (2) admin inputs
for announcements + schedule (empty announcement defaults to a welcome
message), (3) wire the admin-entered schedule onto this tab for real, (4)
the actual UKC schedule gets entered once it exists. Steps 2-4 not started.

- Tab bar is now 5 tabs, not 4: **홈** (new, leftmost) → 친구 → 채팅 → 매칭 →
  마이페이지. 홈 is the new front page (announcements/schedule); 친구 (still
  routed at `/home`) stays what it's always been — your tables/groupmates.
- New route `app/(tabs)/board/page.tsx` (route is `/board`, not `/home` —
  that path was already taken by 친구). Static placeholder only: an
  "Announcement" card that already implements the eventual default (no real
  announcements source exists yet, so it always shows "Welcome to
  {conference name}!"), and an empty-state "Schedule" card. No new tables/
  migrations yet — that's step 2.
- `app/page.tsx`'s root redirect changed from `/home` to `/board` — 홈 is now
  the actual landing page after login, not 친구. Called out here since it's
  a real behavior change (everyone's first screen after logging in) made
  without being asked in so many words, on the reasoning that a tab
  literally labeled "홈" should be the landing page.

## Repo & deploy setup — read this before touching git remotes

`origin` (`sunnycho100/ukc-social`) is the original upstream this was forked
from — stale since 2026-07-23, and **not** connected to Vercel. `fork`
(`J1w0n-H/ukc-social`) is where every commit in this doc actually lives, and
is what Vercel + the live Supabase project are wired to.

**`fork` is the canonical repo going forward** — decided explicitly on
2026-07-30 rather than merging into `origin`, because merging there wouldn't
update the live Vercel deploy (it only watches `fork`'s `main`), and
re-pointing Vercel to `origin` would need write access to it that isn't
granted here. Practical implications:
- Add teammates as collaborators directly on `fork`, not `origin`.
- Keep pushing to `fork main` — that's what ships.
- A PR from `fork` → `origin` is optional, for the upstream owner's
  visibility/archive only — it is **not** part of the ongoing workflow, and
  nothing downstream depends on it landing.

### Update — 2026-07-30 Meal slots (time/place) generalized off the UKC hardcode

`slots` (the 4 dinner/lunch rows every join/matching/chat feature hangs off of)
were still 100% hardcoded to real UKC 2026 dates and a real venue name
("ChampionsGate"), seeded once by hand via `scripts/seed-slots.ts` — a leftover
from before the conference-generalization work, and the actual answer to "why
does this time/place keep showing, how is it set?" when asked about it live.

Rather than building a second admin form to hand-enter slot times (the first
instinct), the dates the admin already enters for the conference are enough to
derive them:

- **`lib/slots.ts`** (new): `deriveSlots(conference)` — one dinner every night
  of the conference except the last, plus a farewell lunch on the last day (a
  single-day conference just gets one dinner). No area/venue is filled in
  (left blank) — same reasoning that already dropped the LLM's "suggested
  place": don't invent a location the app has no real data behind. 7pm dinner
  / 12:30pm lunch, join deadlines 2h before, computed in the conference's own
  timezone + utc_offset. 8 new unit tests (`lib/slots.test.ts`), including a
  non-UTC-offset (Pacific) case and the single/two-day edge cases.
- **`app/actions/conference.ts`**'s `upsertConference()`: after saving the
  conference, calls `deriveSlots` and inserts any titles ("Day 1 Dinner", …,
  "Farewell Lunch") that don't already exist. Deliberately additive-only — if
  the admin later shortens/moves the conference dates, existing slots (which
  may already have real signups/groups on them) are left alone rather than
  rewritten or deleted out from under real data.
- `/admin` now shows each slot's actual date/time next to its title
  (`AdminSlotRow`), not just a bare name — worth seeing now that the dates
  aren't fixed at a glance from the code anymore.
- `scripts/seed-slots.ts` kept as a dev/local convenience (comment updated to
  say so) — no longer the production source of truth.

### Update — 2026-07-30 Dropped the LLM-invented "suggested place," added an icebreaker question

`suggestedPlace` was pure creative text generation — `buildMatchPrompt` just asked
Claude for "a suggested cuisine near X," with no real venue or reservation data behind
it. That's exactly why it produced ungrounded, occasionally nonsensical results (a
coffee-shop-sounding name suggested for a dinner slot, previously reproduced). Where
to actually eat is now left to the table to sort out themselves in chat.

- **Migration `0015_group_starter_question.sql`**: `groups.suggested_place` renamed to
  `starter_question`. **Applied to the live Supabase project on 2026-07-30**, after
  the gap between it and the already-deployed code caused a real bug: every
  `/groups/[id]` and `/groups/[id]/chat` load was erroring on the now-missing column
  and silently 404ing (`if (!group) notFound()` fired on the query error, not just a
  genuine missing group). Confirmed fixed by querying the live DB directly —
  `starter_question` now resolves, `suggested_place` no longer exists.
- `lib/matching.ts`: `MatchGroup.starterQuestion` replaces `suggestedPlace`; the
  now-unused `location` param dropped from `buildMatchPrompt`/`matchSlot` (it only
  ever existed to build the "near X" phrase). Prompt now asks for "a fun icebreaker
  question the table could open with — grounded in what they actually have in
  common, not generic small talk." Round-robin/repacked tables still get an honest
  empty string (no starter question), consistent with their plain name + generic
  rationale.
- Every surface that showed a place now shows a "💬 Break the ice" question instead:
  `GroupReveal.tsx`, Home's `Revealed`/`DayOf`/per-table cards
  (`app/(tabs)/home/page.tsx`), and `Chat.tsx`'s empty state. `Chat.tsx`'s `meetLine`
  simplified to time-only (place was the other half of that line).
- `lib/matching.test.ts`: renamed fixtures, added a regression guard —
  `buildMatchPrompt`'s output must mention "icebreaker question" and must NOT mention
  "cuisine" or "suggested place." Test count: 87 → 88.
- Verified: `tsc`, `npm test` (88/88), `npm run lint` (21 errors + 1 warning — matches
  the pre-existing baseline exactly), `npm run build` (all 19 routes), dev-server
  smoke check.

### Update — 2026-07-29 People's filtering brought back onto 친구 (Home)

Moving People off the bottom tab bar (the nav restructure below) left its stay-badge
(early/late/same) and interest filtering reachable only via one link from Home, and
not reachable at all from 채팅/매칭/마이페이지. Requested back explicitly.

- `components/PeopleBrowser.tsx`: added a school filter (chips, same pattern as the
  existing interest chips) — filtering previously covered stay window and interest
  only, not school, despite school being a core directory field.
- `app/(tabs)/people/page.tsx`: extracted `PeopleSection()` (data fetch +
  `<PeopleBrowser>`), same shared-section pattern already used for Meals/Rides, so
  `/people` and Home read from one implementation, not a copy.
- `app/(tabs)/home/page.tsx`: embeds `PeopleSection` directly under "Line these up" —
  the full stay/interest/school browsing experience is back on 친구 itself now, not
  just linked from it.

### Update — 2026-07-29 UI polish pass (user-reported rough edges)

- **Kicker duplication fixed.** Every tab's small kicker label was falling back to
  its own page title when no conference is registered — which is the live app's
  actual current state, so every tab showed a literal duplicate header (e.g. "Me"
  over "Me", and `/chat` hardcoded a Korean "채팅" over an English "Chat" title). All
  kickers now fall back to "Icebreaker" instead, matching what Home already did.
- **NotificationBell desktop position simplified.** The previous desktop placement
  (`bottom: 84px`, guessed to sit above 마이페이지 in the rail) was never actually
  anchored to the rail's real layout. Simplified to top-right on every breakpoint —
  it never collides with a left-side rail regardless of width, so there's no second
  position to keep in sync.
- **Flight editing merged into Edit profile.** Editing arrival/departure flight times
  was a second, always-open "My flights" section on Me with its own separate Save
  button, disconnected from the "Edit profile" flow. Flight fields now live inside
  the same edit form and save together with one Save button; the read view shows a
  compact flight summary line. `components/FlightEditor.tsx` deleted. Also fixed its
  hardcoded 2026 default flight dates — now derived from the registered conference's
  own dates, same pattern already used in onboarding's `StepPlans`.

### Update — 2026-07-29 Vercel deployment was silently broken since the conference-gen push

Every deploy since `9f8a5ca` (conference generalization + auto-matching, the first
commit in today's four-phase pass) was failing on Vercel — confirmed live via the
GitHub commit-status check ("Deployment failed") and the Deployments tab, which
showed the last **successful** deploy stuck at `42f6f27` (the commit right before
this session started) while every commit after it errored.

- **Root cause**: `vercel.json`'s cron schedule (`"0 * * * *"`, hourly) — Vercel's
  Hobby plan doesn't quietly cap an hourly cron down to daily execution the way the
  earlier write-up in this doc and `docs/CONFERENCE-GENERALIZATION.md` assumed. It
  **rejects the deployment outright**. That assumption was wrong and is corrected in
  both docs now.
- **Fix**: `vercel.json`'s schedule changed to `"0 0 * * *"` (daily) — deploys on
  Hobby again. The admin-configured `matching_interval_minutes` is still enforced
  *inside* `app/api/cron/auto-match` by `shouldAutoMatch()`, independent of this
  schedule; on Pro, the schedule itself could be tightened (e.g. hourly) so a
  sub-daily admin interval actually gets to fire that often.
- **How this was diagnosed**: user reported Vercel only showing a build from ~19h
  ago; checked `git log` on both remotes (`fork` = this repo, had all 5 commits;
  `origin` = the original upstream, stale since 2026-07-23 — ruled out as unrelated);
  user confirmed via GitHub's commit-status check that Vercel deployments were
  attempted and failing, not simply not triggered.
- **Not yet confirmed**: whether this was the *only* deploy blocker — waiting on the
  next deploy attempt to confirm green before calling this fully resolved.

### Update — 2026-07-29 Algorithm test hardening pass

Went through every pure algorithm module in `lib/` (`groupName`, `stay`, `flights`,
`matching`, `mentorMatch`, `autoMatch`) writing deliberately adversarial edge-case
scenarios, not just happy-path coverage. Test count: 52 → **78**. One real bug found
and fixed; everything else was either confirmed-correct-and-now-locked-in via a
regression test, or confirmed-as-a-known-gap and logged (not silently patched).

- 🐛 **Bug fixed — `lib/groupName.ts`'s `nameGroup()`.** `majority = Math.ceil(n / 2)`
  was `0` for an empty member list, and every category's hit-count (also `0` for zero
  members) trivially satisfied `hits >= majority`. An **empty group would confidently
  get a themed vibe name** (e.g. "Send It" — a climbing name) with zero members
  actually backing it, instead of falling through to "mixed." Fixed by flooring
  majority at 1 (`Math.max(1, Math.ceil(n / 2))`). Currently unreachable from the live
  app (`matchOneSlot` in `app/actions/admin.ts` returns early on zero signups before
  `nameGroups` is ever called), but `nameGroup`/`nameGroups` are exported, general-
  purpose functions — this was a real landmine for the next caller. Regression tests
  in `lib/groupName.test.ts`.
- **Found, logged, not changed — `lib/matching.ts`'s `validateAssignment`.** Its own
  comment calls oversize (> max) "a hard fail," but nothing upstream actually enforces
  that: an indivisible party bigger than `max` (e.g. a solo signup with `party_size:
  7`) still produces exactly the table you'd expect from `roundRobinGroups`, and
  `matchOneSlot` inserts it regardless of `validateAssignment`'s `ok: false` — there's
  no split/reject path, nor could there sensibly be one (a party can't be split
  across tables). Test added (`lib/matching.test.ts`) to document this as intentional
  current behavior rather than leave it an implicit assumption. Worth a product call
  if it ever comes up for real (warn the admin? cap party size at signup?).
- New coverage, no bugs found (confirms existing behavior is correct, locks it in
  against regressions): `lib/stay.ts`'s early/late precedence when a stay bookends the
  viewer's whole window, partial-null dates, and a month-boundary comparison;
  `lib/flights.ts`'s AeroDataBox live-API normalization path (`fetchArrivals` mocked
  via `vi.stubGlobal("fetch", …)` — **previously had zero test coverage** for the
  cancelled/landed/delayed/scheduled status inference and flight-number whitespace
  stripping), empty/all-cancelled arrival lists, and the "anchor to first arrival, not
  a sliding window" bucketing behavior; `lib/matching.ts`'s lone-oversized-party and
  two-oversized-parties cases (confirmed no phantom empty-member groups leak through,
  which would otherwise insert broken zero-member tables into the DB);
  `lib/mentorMatch.ts`'s zero-mentor/zero-mentee/empty-roster inputs, tag
  de-duplication in `jaccard`, and the affinity-floor boundary being inclusive
  (`affinity === floor` still fuses).
- `npm test` (78/78), `npx tsc --noEmit`, and `npm run build` (17/17 routes) all clean.

### Update — 2026-07-29 Conference generalization + auto-matching scheduler

Full write-up (feature list + test/verification results, meant to be shared as-is):
`docs/CONFERENCE-GENERALIZATION.md`. Short version:

- New `conferences` table (migration `0012_conference.sql`) + `/admin` registration
  form (`AdminConferenceForm`, `app/actions/conference.ts`) — a fork/deployment now
  configures its own name/location/dates/timezone/airport from the UI instead of
  hardcoded "UKC 2026" constants scattered across the app.
- Every hardcoded "UKC 2026" string and `America/New_York`/`MCO`/`-04:00` constant is
  now sourced from that row (with a generic/`America/New_York` fallback where none is
  registered yet). Deliberately left alone: `scripts/seed-fake.ts`'s `@ukctest.dev`
  fake emails, `scripts/e2e/*.mjs`, and the bundled example arrivals JSON — dev/test
  fixtures, not product surface.
- Matching can now run on a schedule: `auto_matching_enabled` +
  `matching_interval_minutes` on the conference row, a pure `shouldAutoMatch()` gate
  (`lib/autoMatch.ts`, unit tested), and `app/api/cron/auto-match` (bearer-token
  protected via `CRON_SECRET`) wired to Vercel Cron (`vercel.json`, daily tick — the
  admin-configured interval is enforced inside the route). **Vercel Hobby caveat**
  (corrected below): a too-frequent schedule doesn't just get throttled, it breaks
  the deploy outright — `vercel.json` is set to daily so it actually ships on Hobby.
- `runMatching()` (the manual per-slot admin button) and the new `runAllSlotsMatching()`
  (used by the cron route) now share one matching pipeline (`matchOneSlot()` in
  `app/actions/admin.ts`) — no duplicated logic between the manual and scheduled paths.
- **Not done this pass — needs a human with Supabase dashboard access**: migration
  `0012` has not been applied to the live project (`kxvvnvzfdawsnftgjabl`); no
  conference is registered yet, so today every page falls back to its generic/default
  copy. `CRON_SECRET` also isn't set anywhere yet (Vercel env vars + local
  `.env.local`). Same manual-application pattern as every prior migration in this repo.

### Update — 2026-07-29 Rides "Share" → real ride-pool join

Rides' "Share" button was a `useState`-only stub (fixed to stop *lying* about it in an
earlier pass, but still didn't do anything). It's now a real join, reusing `ride_pools`/
`ride_members` — tables that existed since `0001` but nothing ever wrote to:

- `submitFlight()` now opens (or reuses) the posted flight's own pool and seats the poster
  in it. Migration `0011` adds `ride_pools.anchor_flight_id` (unique, → `flights`) plus the
  missing insert policy (`0001` only ever granted `select` on `ride_pools`).
- New `joinRide(flightId)` action: finds the flight's pool, checks the member count against
  `ride_pools.capacity` (default 4), and either seats the joiner or returns `full`. The
  board hides the join action and shows "Full" once capacity's hit — "join, closes at 4,"
  no separate pool-creation step for users to think about.
- Side effect, not additional code: `shares_channel()` already checked `ride_members` for
  contact-unlock (`0008`) — it just never had real rows to find. Sharing a ride now unlocks
  contacts the same way sharing a meal table does.
- Verified live: two accounts, poster posts a flight, joiner clicks Share on the real
  board, DB shows a 2-member pool at capacity 4, UI shows "Joined ✓" for the joiner and
  "Posted" unchanged for the poster.

Migration `0011_ride_join.sql` needs to be applied to the live Supabase project (same
manual step as the others).

### Update — 2026-07-29 verified live end-to-end on a fresh Supabase project

Applied all 10 migrations to a brand-new project (`kxvvnvzfdawsnftgjabl`) and drove the real
app with Playwright against it (magic-link login via `supabase.auth.admin.generateLink`, no
mocking) — not just code tracing this time:

- Full 5-step onboarding (Event & stay → Basics → Interests → Contact & bio → Plans+flight),
  including clicking Back from step 2 back to step 1 to confirm last session's fix holds.
- Joined a real dinner slot; the join sheet's new "Tables revealed" line rendered correctly.
- Ran `/admin` matching for real (22 signups → 4 groups); round-robin fallback fired since
  `ANTHROPIC_API_KEY` wasn't set for this project — rationale correctly read the generic
  "Grouped to keep tables even." — but the table still got a real bank name ("The Grind",
  from the shared "Coffee chat" vibe), confirming the already-logged name/rationale
  mismatch gap below is real and reproducible, not just theoretical.
- Group reveal showed the Frozen-cast roster with "you both like X" shared-interest
  highlighting; opened group chat and sent a message — delivered and rendered live.
- People's stay-badge/Say-hi flow worked against real seeded data
  (`scripts/seed-fake.ts`, now 20 Frozen-cast profiles).
- One anomaly, not reproduced on retry: a single test user's `profiles` row was briefly
  missing after what looked like a successful onboarding finish, on the very first complex
  multi-context script run against this brand-new project (whose own dashboard was showing
  occasional transient 500s at the time). Two clean re-tests (fresh onboarding, and
  re-login of an already-onboarded user) both completed correctly. Flagging as an
  unconfirmed, unreproduced anomaly rather than a code fix — if a real user ever reports
  "I finished setup but the app sent me back to onboarding," this is the first thing to
  check.

Local `.env.local` (gitignored) now points at this live project instead of the placeholder
values from earlier sessions.

### Update — 2026-07-28 Icebreaker reskin + Event & stay + People "Say hi"

Full visual reskin ("Icebreaker" — frost-navy + icy-cyan, Frozen-cast mock data in
`scripts/seed-fake.ts`) plus real product changes, per `Icebreaker Design Guide.dc.html`:

- **Shipped for real:** onboarding step 1 "Event & stay" (`event_id`/`stay_start`/
  `stay_end` on `profiles`, migration `0009`); onboarding step 4 "Contact & bio"
  (collects kakao/linkedin/bio during setup, not left for the Me screen); onboarding's
  flight panel now actually calls `submitFlight()` instead of writing to `localStorage`
  only; Join sheet shows `join_deadline` ("Tables revealed…"); login's "check your email"
  gets Resend (`supabase.auth.resend`) + "use a different email"; People shows a
  stay-relationship badge (`lib/stay.ts`, unit-tested) with filter chips, and a real,
  persisted "Say hi" request (`hi_requests` table, migration `0010`, `app/actions/hi.ts`)
  — deliberately **not** wired into `shares_channel()`, so full-contact RLS is unchanged.
  **`hi_requests` has no recipient-facing inbox UI yet** — the row is written for real
  (unlike the old Rides "Share" stub), but nothing surfaces an incoming request to the
  person who received it. Worth a follow-up.
- **`/mentor` removed.** It was already unreachable from any nav. `lib/mentorMatch.ts` +
  its tests are untouched — if mentor matching gets revisited, see
  `docs/mentor-match-logic.md`'s "What building it needs" section.
- **Logged, not built this pass** (data model is in place; enforcement isn't) — **all
  six of these were actually closed out on 2026-07-29, see "Matching pipeline
  correctness" and "Conference generalization" above; left here, annotated, as the
  original record of the gap rather than deleted outright:**
  - ~~`event_id` isn't read by `runMatching` or `rides.ts`~~ — ✅ fixed:
    `lib/scheduleFilter.ts`'s `isEligibleForSlot()` now hard-filters on it inside
    `matchOneSlot`.
  - ~~`JoinSheet` doesn't check a slot's date against the signer's stay window~~ —
    ✅ fixed: `joinSlot()` returns `schedule_conflict`, `JoinSheet` shows a warning
    and retries with `confirmed: true`.
  - ~~No two-stage matching pipeline exists~~ — ✅ fixed: the schedule filter runs
    first and hard-excludes anyone ineligible; interest scoring only ever sees the
    eligible subset.
  - ~~`matchSlot()` skips the LLM whenever headcount ≤ 6~~ — ✅ fixed: that shortcut
    is gone; round-robin is now genuinely reserved for failure.
  - ~~A failed `validateAssignment` re-packs the whole slot~~ — ✅ fixed:
    `repackInvalid()` keeps whatever tables were already valid.
  - ~~A round-robin table can still draw a flavorful name while its rationale stays
    generic~~ — ✅ fixed: only LLM-matched tables draw a themed name now.
  - ~~`EVENT_OFFSET`/`EVENT_AIRPORT` hardcoded for one event/timezone~~ — ✅ fixed:
    both are now `conferences` row fields (see "Conference generalization" above).
- Migrations `0009_event_stay.sql` and `0010_hi_requests.sql` need to be applied to the
  live Supabase project (same manual step as `0008`) before any of the above works —
  **this is still true**; see "Remaining Human TODOs" below for the current full
  migration list.

### Update — 2026-07-28 bug review pass
- **Security fix (apply promptly): migration `0008_profiles_contact_rls.sql`.** The
  `profiles` SELECT policy allowed any signed-in user — including anonymous guests — to
  read every column of every profile directly (kakao, linkedin, dietary, birthday), not
  just the public fields exposed through `directory_profiles`. The app's "contacts unlock
  only once you share a table" gate (`can_see_contact()`) was only ever enforced in
  `PeopleBrowser`'s UI, not in the database, so it was trivially bypassable with a direct
  Supabase client call. Fixed by scoping the base policy to the owner or anyone who
  already `shares_channel()` with them — every existing read (Me, GroupReveal, Chat
  roster) still works since those only ever query someone the caller already shares a
  group with. **Needs to be applied to the live Supabase project before the event.**
- **Fixed:** onboarding's Step 3 "Add flight info" field wrote to `localStorage` and was
  never read by anything else — a person's flight info typed there during onboarding was
  silently discarded despite the UI claiming "Used later to suggest airport rides."
  Removed; `/rides/add` (with Claude screenshot parsing) is the real, working flow and is
  already surfaced from Home's "Line these up" hub.
- **Fixed:** Rides' "Share" button claimed "*{name} gets your name and can message you*"
  — it's `useState` only, nothing is sent anywhere (no `ride_members`/message row is
  written). Copy corrected to not claim a connection was made.
- **Flagged, not fixed (needs a product/scope decision):** `/mentor` presents opting in as
  a working 1:1 matching feature ("we pair you... and make the intro"), but
  `assignMentees`/`suggestGroups` (`lib/mentorMatch.ts`) are only ever invoked from
  `/match-demo` against synthetic data — there is no admin action, table, or job that runs
  matching against real signed-up users. `docs/mentor-match-logic.md` already tracks this
  as "the model, not yet built," but the live page doesn't currently say so. Worth a call
  on whether to soft-launch the page as "coming soon" before Aug 5, or prioritize building
  the batch job (needs a `matches` table + a daily admin/cron trigger, per that doc's
  "What building it needs" section).

### Update — 2026-07-19 feature + polish run
- **Party size ("come as a group")** shipped: join-time "How many are you?" (1–4), matching
  packs tables by headcount and keeps parties intact, reveal shows "+N with them". Migration
  `0005` applied to cloud. Design spec: `docs/superpowers/specs/2026-07-19-party-size-design.md`.
- **UX gap audit** written: `docs/UX-GAP-AUDIT.md` (prioritized). Fixed on this pass: Kakao
  broken link, Home ride-CTA dead-end, group-reveal back affordance, People empty state.
- **Logo** embedded on login + home header (`public/logo.png`).
- **Design polish** (impeccable): danger/accent-weak/overlay tokens, `:focus-visible` ring,
  unified error reds, teaching Rides placeholder.
- **Repo cleanup**: removed `CLAUDE.md`/`AGENTS.md` (Next.js note folded into README),
  rewrote README with setup + user state-flow.
- **Rides (started)**: `lib/flights.ts` — `fetchArrivals()` uses AeroDataBox (RapidAPI,
  set `AERODATABOX_API_KEY`) or the bundled Aug-4 MCO example; `bucketIntoPools()` groups
  arrivals by revised time so delays re-pool correctly. The Rides tab now renders the
  example pools with delay badges + car-split estimate. Next: join/leave a pool (ride_pools
  tables already exist) + persist onboarding flight info.

## Status: BUILT + VERIFIED END-TO-END on cloud Supabase ✅

_Historical — this section and "Cloud DB state" below describe the **first**
verification pass, against a cloud project (`ctkjzenmwvqgrncxinvt`) that's since been
superseded. The live project as of 2026-07-29 is `kxvvnvzfdawsnftgjabl` (see that
date's "verified live end-to-end" update above) — kept for the QA-bugs-found record,
not as a current migration/DB reference. Use "Remaining Human TODOs" below for
current state._

All 12 core tasks built, and the full flow was driven and verified against the live
cloud database (project `ctkjzenmwvqgrncxinvt`, "sunny2.0"):

- ✅ **Magic-link login** — generated a real link, logged in, hit the callback.
- ✅ **Onboarding** (3 steps, avatar, interests incl. 국밥 crew, dinner opt-ins) → profile saved.
- ✅ **Slot join** → signup row created; **Home dashboard** shows joined-waiting then revealed.
- ✅ **Admin matching** — 21 signups → 4 valid groups (flex: no).
- ✅ **Group reveal** — member cards, interests, Korean names, rationale panel.
- ✅ **Realtime group chat** — verified LIVE delivery between two users (Sunghwan ↔ Ethan), Korean intact.
- ✅ **Directory contact-locking** — groupmate sees Kakao/LinkedIn; non-members gated by `can_see_contact`.

### 3 real bugs found & fixed during QA (all committed)
1. **Auth callback** only handled the PKCE `?code=` flow → magic links bounced to
   `/login?error=auth`. Added `token_hash` + `verifyOtp` path. (`0003`-era commit)
2. **Recursive RLS** on `group_members` (policy queried its own table → infinite
   recursion) silently nulled reveal/home/chat reads. Fixed with a SECURITY DEFINER
   `is_group_member()`. (migration `0003`)
3. **Realtime**: `messages` wasn't in the `supabase_realtime` publication, so chat
   never pushed live. Added it. (migration `0004`)

### Cloud DB state
- `.env.local` (gitignored) holds the live URL + legacy anon/service_role keys.
- Migrations applied: `0001` (schema+RLS), `0002` (directory), `0003` (RLS fix),
  `0004` (realtime), `0005` (party_size). **If you reset/recreate the DB, re-apply all
  five in order.**
- Seeded: 4 real slots (Wed/Thu/Fri dinners + Sat lunch) + 20 fake users on Day 2 Dinner.

## Remaining Human TODOs

_Rewritten 2026-07-29 — everything below is current as of the last update at the top
of this file. Items resolved since the last pass (migration `0008`, the original
Vercel deploy, rides/polish) have been removed rather than left stale; see the dated
Updates above for what actually closed them out._

**Migrations `0001`–`0017` are applied and confirmed live** as of 2026-07-30
(`0011`, `0013`, `0014`, `0017` were the last four before this — verified
directly: `ride_members`, `message_reads`, `notifications` all resolve, and
the `type` check constraint accepts `new_message`/`announcement`).
**`0018_ride_matching.sql` and `0019_ride_member_left.sql` are new and not
yet applied** — needed for the rides-matching rewrite above to work live
(`flights.window_hours`, `ride_pools.airport`, dropped `anchor_flight_id`,
added `ride_pools` update/delete RLS, and the `ride_member_left`
notification type). Until they're applied, `submitFlight`/
`joinProposedPool`/`startOwnPool`/`cancelFlight` will error against the
live schema.

The conference/DB is also live-configured: **UKC 2026** is registered (Aug
5–8, ChampionsGate FL, timezone America/New_York, airport MCO, auto-matching
*off*), and the real Aug 4–8 schedule is seeded (`scripts/seed-schedule.ts`,
34 items — SEED, Signature Symposiums, KSEA/TG/FIRE/IES tracks, Gala/
Networking dinners, Closing Plenary). No announcement text set yet (홈 shows
the default welcome message) — set one via `/admin` whenever there's
something to say.

1. **Set `CRON_SECRET`** in Vercel's env vars (and local `.env.local`) to match what
   Vercel Cron sends as a bearer token to `/api/cron/auto-match`. ⚠️ **Auto-matching
   is deployed but functionally inert** without both this *and* turning
   `auto_matching_enabled` on for the now-registered conference at `/admin` —
   don't read "the cron route exists" as "auto-matching is live." Separately,
   Vercel Hobby only fires the cron tick once/day regardless of the admin-
   configured interval (see the deploy-break update above) — Pro is needed for
   a tighter tick.
2. **Confirm `ANTHROPIC_API_KEY` is set on the live Vercel project.** Without it,
   matching uses the round-robin fallback (groups are correct, but the rationale is
   generic instead of the warm AI blurb, and tables get plain "Table N" names instead
   of a themed one — see "Matching pipeline correctness" above). Status as of the
   last live check (07-29, pre-migration-0012 project) was: not set.
3. **Google OAuth** (optional) — enable in Supabase Auth providers; the login page's
   email+password and magic-link paths already work without it.

## Deploy to Vercel (checklist)

_Deployed as of 2026-07-29 — this repo is live on Vercel via the `fork` remote
(`J1w0n-H/ukc-social`), auto-deploying `main` (confirmed green after the cron-schedule
fix above). Kept below as the runbook for a fresh project/re-deploy, not a "not done
yet" TODO anymore — steps 1–4 don't need repeating for this project._

1. **Import the repo** into Vercel (framework auto-detects as Next.js).
2. **Set env vars** in Vercel → Project → Settings → Environment Variables (Production +
   Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `CRON_SECRET` (must match the bearer
   token Vercel Cron sends to `/api/cron/auto-match`), and optionally
   `ANTHROPIC_API_KEY` (AI matching rationale + flight-screenshot parsing; without it
   both fall back to deterministic/manual paths) and `GEMINI_API_KEY`. Values mirror
   `.env.local`. The service-role key is server-only — never expose it as
   `NEXT_PUBLIC_*`. (`AERODATABOX_API_KEY` used to be listed here for a live
   airport-arrivals feed — `lib/flights.ts` was deleted 2026-07-31, never wired
   into any page; Rides matches on self-reported flight times now, see the
   rides-matching update above.)
3. **Deploy**, note the assigned domain (e.g. `icebreaker.vercel.app`).
4. **Point Supabase auth at the domain:** Supabase → Auth → URL Configuration →
   Site URL `https://<domain>`, and add redirect `https://<domain>/auth/callback`
   (keep `http://localhost:3000/auth/callback` for local dev). Magic links bounce to
   `/login?error=auth` if this is missing.
5. **DB is live** (project `kxvvnvzfdawsnftgjabl`), but only `0001`→`0010` are
   confirmed applied — **`0011`→`0014` still need applying, see "Remaining Human
   TODOs" above.** Seeded with real slots + 20 Frozen-cast fake profiles. If you
   deploy against a fresh Supabase project instead, apply all fourteen migrations in
   order first, then re-seed.
6. **Smoke test on the domain:** magic-link login → onboarding (5 steps) → join a dinner
   (try a party of 2–3) → admin runs matching at `/<domain>/admin` → reveal → chat
   delivers live → People's Say hi.
7. **(Optional) Google OAuth:** enable in Supabase Auth providers; the magic-link path works
   without it.

## Dev helpers
- `scripts/seed-slots.ts`, `scripts/seed-fake.ts`, `scripts/seed-schedule.ts` — `npx -y tsx --env-file=.env.local scripts/<f>.ts`
- `scripts/dev-magiclink.mjs <email>` — prints a local login link for testing (no inbox needed).

## Known nits (not blockers)
- Next 16: rename `middleware.ts` → `proxy.ts` eventually.
- `/meals` shows an error card (not a redirect) if the DB is ever unreachable.
- Magic-link emails from real Supabase go to the real inbox; for scripted testing use `dev-magiclink.mjs`.
