"use server";

import { parseRorOrgs, type School } from "@/lib/schools";

// Suggestions for the School field, from ROR's public API.
//
// Server-side rather than from the browser: it keeps the app's own origin the
// only thing the client talks to, and Next caches identical queries so a room
// full of people typing the same university is one request.
export async function searchSchools(query: string): Promise<School[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const res = await fetch(
      `https://api.ror.org/v2/organizations?query=${encodeURIComponent(q)}`,
      { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(4000) },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { items?: unknown };
    return parseRorOrgs(body.items).slice(0, 6);
  } catch {
    // Offline, slow, or rate limited. The field is free text, so returning
    // nothing costs the user a suggestion, not their entry.
    return [];
  }
}
