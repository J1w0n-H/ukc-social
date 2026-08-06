// A profile row exists from the first sign-in, before onboarding has set a
// name. /people filters those rows out (see app/(tabs)/people/page.tsx), but a
// table, ride or chat roster cannot: dropping the row there would delete the
// person from their own group. So rosters render this instead of a blank line.
export const displayName = (name: string | null | undefined) =>
  name?.trim() || "Someone";

// Whether the name shown is the placeholder rather than something they chose.
// Rosters use it to say why the row is thin instead of leaving a bare dash.
export const isUnnamed = (name: string | null | undefined) => !name?.trim();
