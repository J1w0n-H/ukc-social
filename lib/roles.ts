// What stage someone is at. Free text made three people type "Bachelors",
// "Undergrad" and "Graduate Student" for two actual stages, which is both a
// messy directory and a broken input to mentor matching: that pipeline sorts
// mentors from mentees by stage, so a spelling it cannot read is a person it
// cannot place.
import type { Role } from "./mentorMatch";

export const POSITIONS = [
  "Undergraduate",
  "Master's",
  "PhD",
  "Postdoc",
  "Faculty",
  "Working",
] as const;

export type Position = (typeof POSITIONS)[number];

const ROLE_OF: Record<Position, Role> = {
  Undergraduate: "undergrad",
  "Master's": "masters",
  PhD: "phd",
  Postdoc: "postdoc",
  Faculty: "faculty",
  Working: "industry",
};

export function toRole(position: string): Role | null {
  return ROLE_OF[position as Position] ?? null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "");

// Spellings seen in the wild, plus the obvious near-misses. Only unambiguous
// ones belong here: "graduate student" is deliberately absent because it could
// be a master's or a PhD, and those sit on opposite sides of the mentor split.
// Guessing there would quietly mis-sort a real person.
const ALIASES: Record<string, Position> = {
  bachelors: "Undergraduate",
  bachelor: "Undergraduate",
  undergrad: "Undergraduate",
  undergraduate: "Undergraduate",
  student: "Undergraduate",
  bs: "Undergraduate",
  masters: "Master's",
  master: "Master's",
  ms: "Master's",
  msc: "Master's",
  mastersstudent: "Master's",
  phd: "PhD",
  phdstudent: "PhD",
  phdcandidate: "PhD",
  doctoral: "PhD",
  postdoc: "Postdoc",
  postdoctoral: "Postdoc",
  professor: "Faculty",
  faculty: "Faculty",
  lecturer: "Faculty",
  working: "Working",
  industry: "Working",
  engineer: "Working",
  softwareengineer: "Working",
  researcher: "Working",
};

// The option a stored free-text value corresponds to, or null when it is not
// clear enough to rewrite. Null means leave it alone and let the person pick.
export function canonicalPosition(value: string): Position | null {
  const key = norm(value);
  if (!key) return null;
  const exact = POSITIONS.find((p) => norm(p) === key);
  return exact ?? ALIASES[key] ?? null;
}
