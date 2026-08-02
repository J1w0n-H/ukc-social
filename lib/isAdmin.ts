import { serviceClient } from "./supabase/service";

export type AdminUser = { id: string; email?: string | null } | null | undefined;

// Splits ADMIN_EMAIL on commas so a deployment can name more than one admin,
// and compares case-insensitively after trimming. The old check was a bare
// `user.email !== process.env.ADMIN_EMAIL`, which also treats a stray space or
// a capital letter as "not an admin".
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// True if the user is an admin by env var OR by a row in `admins`.
//
// The table exists because the env var alone is a single point of failure: the
// first production deploy had no matching ADMIN_EMAIL, so /admin returned 404
// for everyone, and /admin is the only way to seat anyone. A row in `admins`
// is granted with SQL and needs no redeploy.
//
// The lookup uses the service role because `admins` has RLS enabled with no
// policies, so a user session cannot read it. A failure here returns false
// rather than throwing: losing the table should deny admin, never 500 the page.
export async function isAdmin(user: AdminUser): Promise<boolean> {
  if (!user) return false;

  const email = user.email?.trim().toLowerCase();
  if (email && adminEmails().includes(email)) return true;

  try {
    const { data } = await serviceClient()
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
