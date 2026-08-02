// Seeds a self-contained demo cohort for recording / manual testing, and tears
// it down again. Everything it creates is addressed by one marker: the reserved
// @example.com email domain (RFC 2606, can never belong to a real person). That
// is the whole ledger, so cleanup cannot drift out of sync with a state file.
//
//   node --env-file=.env.local scripts/demo-seed.mjs check
//   node --env-file=.env.local scripts/demo-seed.mjs seed
//   node --env-file=.env.local scripts/demo-seed.mjs clean
//
// `seed` refuses to touch a slot that already has a signup from a real account,
// so a live participant can never be pulled into the demo cohort.
import { createClient } from "@supabase/supabase-js";

const MARKER = "@example.com";
const SLOT_TITLE = "Day 3 Dinner";
const EVENT_ID = "ukc2026";
const STAY = { start: "2026-08-05", end: "2026-08-09" };

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Two deliberate interest clusters. If the matcher is doing real work, Sunny
// lands with the perception people and not with the bio people, which is the
// thing a demo is supposed to demonstrate.
const PEOPLE = [
  { name: "Sunny Cho",   school: "UW-Madison",       position: "PhD student", interests: ["Robotics", "Computer Vision", "Perception"] },
  { name: "Jaeyoon Park", school: "Georgia Tech",    position: "PhD student", interests: ["Robotics", "Perception", "Controls"] },
  { name: "Minji Seo",   school: "Carnegie Mellon",  position: "Masters",     interests: ["Computer Vision", "Machine Learning", "Robotics"] },
  { name: "Daniel Kwon", school: "Michigan",         position: "PhD student", interests: ["Autonomous Driving", "Perception", "Computer Vision"] },
  { name: "Hyewon Lim",  school: "UIUC",             position: "Postdoc",     interests: ["Robotics", "Controls", "Machine Learning"] },
  { name: "Soojin Han",  school: "Johns Hopkins",    position: "PhD student", interests: ["Biomedical Engineering", "Drug Delivery", "Cancer Biology"] },
  { name: "Kevin Oh",    school: "UC San Diego",     position: "Masters",     interests: ["Bioinformatics", "Genomics", "Cancer Biology"] },
  { name: "Yerin Baek",  school: "Emory",            position: "PhD student", interests: ["Neuroscience", "Biomedical Engineering", "Imaging"] },
  { name: "Junho Ahn",   school: "UW-Madison",       position: "Postdoc",     interests: ["Drug Delivery", "Materials", "Biomedical Engineering"] },
  { name: "Chaewon Ryu", school: "Duke",             position: "Masters",     interests: ["Genomics", "Bioinformatics", "Neuroscience"] },
];

const emailFor = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, ".")}${MARKER}`;

async function allUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    out.push(...data.users);
    if (data.users.length < 200) break;
  }
  return out;
}

const seededUsers = async () => (await allUsers()).filter((u) => (u.email ?? "").endsWith(MARKER));

async function targetSlot() {
  const { data } = await svc.from("slots").select("id, title, starts_at").eq("title", SLOT_TITLE).maybeSingle();
  if (!data) throw new Error(`slot "${SLOT_TITLE}" not found`);
  return data;
}

async function check() {
  const slot = await targetSlot();
  const seeded = await seededUsers();
  const seededIds = new Set(seeded.map((u) => u.id));
  const { data: signups } = await svc.from("signups").select("user_id").eq("slot_id", slot.id);
  const real = (signups ?? []).filter((s) => !seededIds.has(s.user_id));
  const { count: groups } = await svc.from("groups").select("*", { count: "exact", head: true }).eq("slot_id", slot.id);
  console.log(`slot        : ${slot.title} (${slot.id})`);
  console.log(`seeded users: ${seeded.length}`);
  console.log(`signups     : ${signups?.length ?? 0} (${real.length} from real accounts)`);
  console.log(`groups      : ${groups}`);
  return { slot, seeded, seededIds, realSignups: real.length };
}

async function seed() {
  const { slot, realSignups } = await check();
  if (realSignups > 0) throw new Error(`${realSignups} real signup(s) on ${slot.title}. Refusing to seed.`);

  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error("set DEMO_PASSWORD in the environment");

  const created = [];
  for (const p of PEOPLE) {
    const email = emailFor(p.name);
    const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`${email}: ${error.message}`);
    created.push({ ...p, email, id: data.user.id });
  }

  const { error: pErr } = await svc.from("profiles").insert(
    created.map((p) => ({
      id: p.id,
      name: p.name,
      school: p.school,
      position: p.position,
      interests: p.interests,
      event_id: EVENT_ID,
      stay_start: STAY.start,
      stay_end: STAY.end,
      bio: "",
    })),
  );
  if (pErr) throw new Error(`profiles: ${pErr.message}`);

  const { error: sErr } = await svc
    .from("signups")
    .insert(created.map((p) => ({ slot_id: slot.id, user_id: p.id, party_size: 1, notes: "" })));
  if (sErr) throw new Error(`signups: ${sErr.message}`);

  console.log(`\nseeded ${created.length} into ${slot.title}:`);
  for (const p of created) console.log(`  ${p.name.padEnd(14)} ${p.email}`);
}

async function clean() {
  const slot = await targetSlot();
  const seeded = await seededUsers();
  const ids = new Set(seeded.map((u) => u.id));

  // Groups on the demo slot go first. Deleting them cascades group_members and
  // message_reads; messages carry no foreign key, so those are cleared by hand.
  const { data: groups } = await svc.from("groups").select("id").eq("slot_id", slot.id);
  const groupIds = (groups ?? []).map((g) => g.id);
  if (groupIds.length) {
    await svc.from("messages").delete().eq("channel_type", "meal").in("channel_id", groupIds);
    await svc.from("groups").delete().eq("slot_id", slot.id);
  }
  for (const id of ids) {
    await svc.from("notifications").delete().eq("user_id", id);
    const { error } = await svc.auth.admin.deleteUser(id); // cascades profiles -> signups
    if (error) console.error(`  failed to delete ${id}: ${error.message}`);
  }
  console.log(`removed ${groupIds.length} group(s) and ${ids.size} seeded user(s)`);
  await check();
}

const cmd = process.argv[2];
const run = { check, seed, clean }[cmd];
if (!run) {
  console.error("usage: demo-seed.mjs <check|seed|clean>");
  process.exit(1);
}
await run();
