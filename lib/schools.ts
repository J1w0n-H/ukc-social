// School names, canonicalised against ROR (Research Organization Registry).
//
// The problem this solves: "UW Madison" and "University of Wisconsin-Madison"
// are one school typed two ways, and the People filter showed them as two
// separate chips. ROR is the right source because its records carry aliases
// and acronyms, so a search for "UW Madison" or "Georgia Tech" or "KAIST"
// resolves to the full name. The field also accepts companies, so free text is
// always allowed: the picker suggests, it does not constrain.

export type School = { name: string; aliases: string[] };

// Comparison form. The dash class matters: ROR writes "University of
// Wisconsin–Madison" with an en dash, people type a hyphen or a space, and all
// three have to land on the same string.
export function normalizeSchool(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―]/g, "-")
    .replace(/[^a-z0-9가-힣]+/g, " ")
    .trim();
}

type RorName = { value: string; types: string[] };
type RorOrg = { names?: RorName[]; types?: string[] };

// Pulls the display name and every alias/acronym out of a ROR v2 payload.
// Non-education records (funders, companies, hospitals) are dropped: this
// powers a "School" field, and ROR carries plenty that is not one.
export function parseRorOrgs(items: unknown): School[] {
  if (!Array.isArray(items)) return [];
  const out: School[] = [];
  for (const raw of items as RorOrg[]) {
    if (!raw?.types?.includes("education") || !Array.isArray(raw.names)) continue;
    const display = raw.names.find((n) => n.types?.includes("ror_display"))?.value;
    if (!display) continue;
    const aliases = raw.names
      .filter((n) => n.value !== display && n.types?.some((t) => t === "alias" || t === "acronym"))
      .map((n) => n.value);
    out.push({ name: display, aliases });
  }
  return out;
}

// The canonical name for something already typed, or null when nothing matches
// closely enough to rewrite it. Deliberately exact-after-normalising rather
// than fuzzy: this is used by the migration to overwrite what a real person
// entered, so a wrong guess is worse than leaving it alone.
export function matchCanonical(input: string, schools: School[]): string | null {
  const target = normalizeSchool(input);
  if (!target) return null;
  for (const s of schools) {
    if (normalizeSchool(s.name) === target) return s.name;
    if (s.aliases.some((a) => normalizeSchool(a) === target)) return s.name;
  }
  return null;
}
