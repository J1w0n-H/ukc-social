// Folds stored free-text positions onto the options the picker offers.
// Anything ambiguous is left alone on purpose: master's and PhD sit on
// opposite sides of the mentor split, so a guess there mis-sorts a real
// person. Those people re-pick next time they open their profile.
//
//   node --env-file=.env.local --experimental-strip-types scripts/canonicalize-positions.mjs
//   node --env-file=.env.local --experimental-strip-types scripts/canonicalize-positions.mjs --write
import { createClient } from "@supabase/supabase-js";
import { canonicalPosition } from "../lib/roles.ts";

const write = process.argv.includes("--write");
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: rows, error } = await supa
  .from("profiles").select("id, name, position").not("position", "is", null).neq("position", "");
if (error) throw error;

const todo = [];
for (const r of rows) {
  const to = canonicalPosition(r.position);
  if (!to) console.log(`ASK    ${r.name}: ${JSON.stringify(r.position)} is ambiguous, leaving it`);
  else if (to === r.position) console.log(`keep   ${r.name}: ${JSON.stringify(r.position)}`);
  else {
    console.log(`CHANGE ${r.name}: ${JSON.stringify(r.position)} -> ${JSON.stringify(to)}`);
    todo.push({ ...r, to });
  }
}

console.log(`\n${todo.length} of ${rows.length} profile(s) would change.`);
if (!write) {
  console.log("Dry run. Re-run with --write to apply.");
  process.exit(0);
}

for (const r of todo) {
  const { error: upErr } = await supa.from("profiles").update({ position: r.to }).eq("id", r.id);
  console.log(upErr ? `FAILED ${r.name}: ${upErr.message}` : `updated ${r.name} -> ${r.to}`);
}
