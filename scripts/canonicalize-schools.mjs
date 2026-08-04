// Rewrites existing profiles.school values to their canonical ROR name, so
// people already signed up group with everyone who signs up after the picker
// landed. Dry run by default; pass --write to apply.
//
// The flag is for importing lib/schools.ts directly, so the migration and the
// app agree on what counts as a match.
//
//   node --env-file=.env.local --experimental-strip-types scripts/canonicalize-schools.mjs
//   node --env-file=.env.local --experimental-strip-types scripts/canonicalize-schools.mjs --write
import { createClient } from "@supabase/supabase-js";
import { parseRorOrgs, matchCanonical } from "../lib/schools.ts";

const write = process.argv.includes("--write");
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: rows, error } = await supa
  .from("profiles").select("id, name, school").not("school", "is", null).neq("school", "");
if (error) throw error;

const distinct = [...new Set(rows.map((r) => r.school))];
console.log(`${rows.length} profiles, ${distinct.length} distinct values\n`);

const mapping = new Map();
for (const value of distinct) {
  const res = await fetch(`https://api.ror.org/v2/organizations?query=${encodeURIComponent(value)}`);
  const schools = res.ok ? parseRorOrgs((await res.json()).items) : [];
  const canonical = matchCanonical(value, schools);
  mapping.set(value, canonical);
  console.log(`${canonical && canonical !== value ? "CHANGE" : "keep  "}  ${JSON.stringify(value)}` +
    (canonical && canonical !== value ? ` -> ${JSON.stringify(canonical)}` : ""));
}

const todo = rows.filter((r) => mapping.get(r.school) && mapping.get(r.school) !== r.school);
console.log(`\n${todo.length} profile(s) would change.`);

if (!write) {
  console.log("Dry run. Re-run with --write to apply.");
  process.exit(0);
}

for (const r of todo) {
  const to = mapping.get(r.school);
  const { error: upErr } = await supa.from("profiles").update({ school: to }).eq("id", r.id);
  console.log(upErr ? `FAILED ${r.name}: ${upErr.message}` : `updated ${r.name} -> ${to}`);
}
