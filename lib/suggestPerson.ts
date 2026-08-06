// One person to say hi to on 홈, picked from everyone you have not asked yet.
//
// Deliberately not mentorMatch.scorePair: that weights `field` and
// `researchArea`, which the profiles table does not have. Passing empty strings
// would score every pair as a perfect field match, since "" === "". What real
// profiles actually carry is interests, school and position, so that is what
// this ranks on.
import { jaccard } from "./mentorMatch";

export type Candidate = {
  id: string;
  name: string;
  photo_url: string | null;
  school: string;
  position: string;
  interests: string[];
};

export type Suggestion = Candidate & {
  // The interests you have in common, in their wording, capped for one line.
  shared: string[];
};

// A different school is worth a nudge, not a decision: the point of the
// conference is the people you would not have run into at home.
const CROSS_SCHOOL = 0.05;
const MAX_SHARED = 2;

export function rankSuggestions(
  me: { id: string; school: string; interests: string[] },
  candidates: Candidate[],
  alreadyAsked: Iterable<string>,
  limit = 3,
): Suggestion[] {
  const skip = new Set(alreadyAsked);
  const mine = new Set(me.interests.map((i) => i.trim().toLowerCase()).filter(Boolean));

  return candidates
    .filter((c) => c.id !== me.id && !skip.has(c.id) && c.name.trim() !== "")
    .map((c) => ({
      candidate: c,
      shared: c.interests.filter((i) => mine.has(i.trim().toLowerCase())).slice(0, MAX_SHARED),
      score:
        jaccard(me.interests, c.interests) +
        (c.school && me.school && c.school !== me.school ? CROSS_SCHOOL : 0),
    }))
    // Ties break on id so the same person is suggested on every reload. A
    // random tie-break would reshuffle the row on each render and make the
    // suggestion feel like noise.
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id))
    .slice(0, limit)
    .map(({ candidate, shared }) => ({ ...candidate, shared }));
}
